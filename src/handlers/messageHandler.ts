import type { Client, Message } from 'whatsapp-web.js'
import { processMessage } from '../agent/agentService.js'
import { formatAttendantNotification } from '../tools/pixService.js'
import { db } from '../lib/db.js'

const COMPANY_PHONE = process.env['COMPANY_PHONE'] ?? ''

// Histórico em memória por sessão (substituir por banco em v2)
const sessionHistory = new Map<string, Array<{ role: 'user' | 'model'; text: string }>>()
// Mapa de clientes aguardando comprovante: phone → { orderId, total }
const awaitingComprovante = new Map<string, { orderId: string; total: number; name: string }>()

/**
 * Ponto de entrada para todas as mensagens recebidas.
 */
export async function handleMessage(client: Client, message: Message): Promise<void> {
  const phone = message.from.replace('@c.us', '')
  const isCompany = phone === COMPANY_PHONE

  if (isCompany) {
    await handleAttendantCommand(client, message)
    return
  }

  if (message.hasMedia) {
    await handleComprovante(client, message, phone)
    return
  }

  await handleTextMessage(client, message, phone)
}

/**
 * Mensagem de texto do cliente — processa via Gemini.
 */
async function handleTextMessage(client: Client, message: Message, phone: string): Promise<void> {
  const text = message.body.trim()

  // Mensagem vazia — cliente abriu a conversa sem digitar nada
  if (!text) {
    await message.reply(
      'Oi! 😊 Seja bem-vindo(a) à *Tentação em Pedaços*! Aqui é a Paty, tô aqui pra te ajudar!\n\n' +
      'O que posso fazer por você? É só digitar o número:\n\n' +
      '1 - 🧁 Ver cardápio\n' +
      '2 - 🛒 Fazer um pedido\n' +
      '3 - 📦 Status do pedido\n' +
      '4 - ⭐ Programa de fidelidade\n' +
      '5 - 👩 Falar com atendente',
    )
    return
  }

  // Recupera ou inicia histórico da sessão
  const history = sessionHistory.get(phone) ?? []

  try {
    // Nome do contato (fallback para número)
    const contact = await message.getContact()
    const customerName = contact.pushname || phone

    const response = await processMessage(phone, customerName, text, history)

    // Atualiza histórico (mantém últimas 20 mensagens para controle de tokens)
    history.push({ role: 'user', text })
    history.push({ role: 'model', text: response.text })
    if (history.length > 20) history.splice(0, 2)
    sessionHistory.set(phone, history)

    // Envia resposta ao cliente
    await message.reply(response.text)

    // Pedido criado via Pix → registra que cliente deve enviar comprovante
    if (response.orderCreated?.paymentMethod === 'pix') {
      awaitingComprovante.set(phone, {
        orderId: response.orderCreated.orderId,
        total: response.orderCreated.total,
        name: customerName,
      })
    }

    // Transferência para atendente → notifica empresa
    if (response.transferToAttendant) {
      await notifyAttendant(client, phone, customerName, 'Cliente solicitou atendimento humano.')
    }

  } catch (err) {
    console.error(`[messageHandler] Erro ao processar mensagem de ${phone}:`, err)
    sessionHistory.delete(phone)
    awaitingComprovante.delete(phone)
    await message.reply(
      'Opa, tive um probleminha técnico aqui! 😅\n\n' +
      'Já reiniciei nossa conversa. O que posso fazer por você? É só digitar o número:\n\n' +
      '1 - 🧁 Ver cardápio\n' +
      '2 - 🛒 Fazer um pedido\n' +
      '3 - 📦 Status do pedido\n' +
      '4 - ⭐ Programa de fidelidade\n' +
      '5 - 👩 Falar com atendente',
    )
  }
}

/**
 * Cliente enviou arquivo — trata como comprovante Pix.
 */
async function handleComprovante(client: Client, message: Message, phone: string): Promise<void> {
  const pending = awaitingComprovante.get(phone)

  if (!pending) {
    await message.reply(
      'Não encontrei nenhum pedido aguardando pagamento. ' +
      'Se precisar de ajuda, é só chamar! 😊',
    )
    return
  }

  const notification = formatAttendantNotification(
    phone,
    pending.name,
    pending.orderId,
    Math.round(pending.total * 100),
  )

  const companyContact = `${COMPANY_PHONE}@c.us`
  await client.sendMessage(companyContact, notification)

  const media = await message.downloadMedia()
  if (media) {
    await client.sendMessage(companyContact, media, {
      caption: `Comprovante de ${pending.name} (${phone}) — Pedido #${pending.orderId}`,
    })
  }

  // Marca comprovante como pendente no banco
  await db.order.updateMany({
    where: { orderNumber: Number(pending.orderId), customerPhone: phone },
    data: { comprovanteStatus: 'pendente' },
  })

  await message.reply(
    '✅ Comprovante recebido! Estamos validando seu pagamento.\n' +
    'Em breve confirmaremos seu pedido. 🎂',
  )
}

/**
 * Atendente enviou comando de confirmação ou recusa de pedido.
 */
async function handleAttendantCommand(client: Client, message: Message): Promise<void> {
  const text = message.body.trim().toLowerCase()

  const confirmMatch = text.match(/^confirmar\s+(\S+)/)
  const recusarMatch  = text.match(/^recusar\s+(\S+)/)

  if (confirmMatch) {
    const orderId = confirmMatch[1] ?? ''
    await confirmOrder(client, orderId)
    return
  }

  if (recusarMatch) {
    const orderId = recusarMatch[1] ?? ''
    await refuseOrder(client, orderId)
    return
  }
}

async function confirmOrder(client: Client, orderId: string): Promise<void> {
  const order = await db.order.findFirst({
    where: { orderNumber: Number(orderId) },
  })
  if (!order) {
    console.warn(`[pedido] Pedido #${orderId} não encontrado no banco.`)
    return
  }

  await db.order.update({
    where: { id: order.id },
    data: { status: 'pago', comprovanteStatus: 'confirmado' },
  })

  await client.sendMessage(
    `${order.customerPhone}@c.us`,
    `✅ Pagamento do pedido *#${orderId}* confirmado! Seu pedido entrou na fila de produção. 🎂`,
  )
}

async function refuseOrder(client: Client, orderId: string): Promise<void> {
  const order = await db.order.findFirst({
    where: { orderNumber: Number(orderId) },
  })
  if (!order) {
    console.warn(`[pedido] Pedido #${orderId} não encontrado no banco.`)
    return
  }

  await db.order.update({
    where: { id: order.id },
    data: { status: 'aguardando_pagamento', comprovanteStatus: 'recusado' },
  })

  await client.sendMessage(
    `${order.customerPhone}@c.us`,
    `❌ Não conseguimos validar o comprovante do pedido *#${orderId}*.\n\nPor favor, envie novamente ou entre em contato com a gente. 😊`,
  )
}

async function notifyAttendant(
  client: Client,
  customerPhone: string,
  customerName: string,
  reason: string,
): Promise<void> {
  if (!COMPANY_PHONE) return
  await client.sendMessage(
    `${COMPANY_PHONE}@c.us`,
    `🙋 *Atendimento solicitado*\n\nCliente: ${customerName} (${customerPhone})\nMotivo: ${reason}`,
  )
}
