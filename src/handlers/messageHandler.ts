import type { WppClient, WppMessage } from '../adapters/types.js'
import { processMessage } from '../agent/agentService.js'
import { formatAttendantNotification } from '../tools/pixService.js'
import { db } from '../lib/db.js'

const COMPANY_PHONE = process.env['COMPANY_PHONE'] ?? ''

type HistoryEntry = { role: 'user' | 'model'; text: string }

async function loadHistory(phone: string): Promise<HistoryEntry[]> {
  const conv = await db.conversation.findUnique({ where: { phone } })
  if (!conv) return []
  try {
    return JSON.parse(conv.history) as HistoryEntry[]
  } catch {
    return []
  }
}

async function saveHistory(phone: string, history: HistoryEntry[]): Promise<void> {
  await db.conversation.upsert({
    where: { phone },
    create: { phone, history: JSON.stringify(history) },
    update: { history: JSON.stringify(history) },
  })
}

/**
 * Ponto de entrada para todas as mensagens recebidas.
 */
export async function handleMessage(client: WppClient, message: WppMessage): Promise<void> {
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
async function handleTextMessage(client: WppClient, message: WppMessage, phone: string): Promise<void> {
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

  const history = await loadHistory(phone)

  try {
    const contact = await message.getContact()
    const customerName = contact.pushname || phone

    const response = await processMessage(phone, customerName, text, history)

    history.push({ role: 'user', text })
    history.push({ role: 'model', text: response.text })
    if (history.length > 20) history.splice(0, 2)
    await saveHistory(phone, history)

    await message.reply(response.text)

    if (response.transferToAttendant) {
      await notifyAttendant(client, phone, customerName, 'Cliente solicitou atendimento humano.')
    }

  } catch (err) {
    console.error(`[messageHandler] Erro ao processar mensagem de ${phone}:`, err)
    await saveHistory(phone, [])
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
async function handleComprovante(client: WppClient, message: WppMessage, phone: string): Promise<void> {
  const order = await db.order.findFirst({
    where: {
      customerPhone: phone,
      paymentMethod: 'pix',
      status: 'aguardando_pagamento',
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!order?.orderNumber) {
    await message.reply(
      'Não encontrei nenhum pedido aguardando pagamento. ' +
      'Se precisar de ajuda, é só chamar! 😊',
    )
    return
  }

  const orderId = String(order.orderNumber)
  const notification = formatAttendantNotification(
    phone,
    order.customerName,
    orderId,
    Math.round(order.total * 100),
  )

  const companyContact = `${COMPANY_PHONE}@c.us`
  await client.sendMessage(companyContact, notification)

  const media = await message.downloadMedia()
  if (media) {
    await client.sendMessage(companyContact, media, {
      caption: `Comprovante de ${order.customerName} (${phone}) — Pedido #${orderId}`,
    })
  }

  await db.order.update({
    where: { id: order.id },
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
async function handleAttendantCommand(client: WppClient, message: WppMessage): Promise<void> {
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

async function confirmOrder(client: WppClient, orderId: string): Promise<void> {
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

async function refuseOrder(client: WppClient, orderId: string): Promise<void> {
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
  client: WppClient,
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
