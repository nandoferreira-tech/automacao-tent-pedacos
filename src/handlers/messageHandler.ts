import type { WppClient, WppMessage } from '../adapters/types.js'
import { processMessage } from '../agent/agentService.js'
import {
  formatAttendantNotification,
  formatOrderSummaryForBakery,
  formatPixInstructions,
} from '../tools/pixService.js'
import { db } from '../lib/db.js'

const COMPANY_PHONE = process.env['COMPANY_PHONE'] ?? ''
const CUTOFF_HOUR = Number(process.env['CUTOFF_HOUR'] ?? 11)

type HistoryEntry = { role: 'user' | 'model'; text: string }

// Estado em memória: quando a boleria enviou "2", aguardamos o motivo da recusa
let pendingRefusalOrderNumber: number | null = null

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

    if (response.orderCreated) {
      await notifyBakeryNewOrder(client, response.orderCreated.orderNumber)
    }

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
 * Envia o resumo do novo pedido à boleria para aprovação.
 */
async function notifyBakeryNewOrder(client: WppClient, orderNumber: number): Promise<void> {
  if (!COMPANY_PHONE) return

  const order = await db.order.findFirst({
    where: { orderNumber },
    include: { items: { include: { product: true } } },
  })
  if (!order) return

  const summary = formatOrderSummaryForBakery({
    orderNumber: order.orderNumber!,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    items: order.items,
    total: order.total,
    deliveryType: order.deliveryType,
    address: order.address,
    paymentMethod: order.paymentMethod,
  })

  await client.sendMessage(`${COMPANY_PHONE}@c.us`, summary)
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
 * Boleria enviou mensagem — pode ser aprovação/recusa de pedido ou confirmação de Pix.
 */
async function handleAttendantCommand(client: WppClient, message: WppMessage): Promise<void> {
  const text = message.body.trim()
  const lower = text.toLowerCase()

  // Se estava aguardando motivo da recusa, qualquer texto livre é o motivo
  if (pendingRefusalOrderNumber !== null) {
    const isCommand = /^(1|2|confirmar|recusar)\b/.test(lower)
    if (!isCommand) {
      await rejectOrderWithReason(client, pendingRefusalOrderNumber, text)
      pendingRefusalOrderNumber = null
      return
    }
  }

  // Aprovação do pedido
  if (lower === '1') {
    await acceptOrder(client)
    return
  }

  // Início de recusa — pede motivo
  if (lower === '2') {
    const order = await db.order.findFirst({
      where: { status: 'aguardando_aprovacao' },
      orderBy: { createdAt: 'asc' },
    })
    if (!order?.orderNumber) {
      await client.sendMessage(`${COMPANY_PHONE}@c.us`, 'Não há pedidos aguardando aprovação.')
      return
    }
    pendingRefusalOrderNumber = order.orderNumber
    await client.sendMessage(
      `${COMPANY_PHONE}@c.us`,
      `Ok! Qual o motivo da recusa do Pedido *#${order.orderNumber}*?\nDigite o motivo na próxima mensagem.`,
    )
    return
  }

  // Confirmação de comprovante Pix (fluxo existente)
  const confirmMatch = lower.match(/^confirmar\s+(\S+)/)
  const recusarMatch  = lower.match(/^recusar\s+(\S+)/)

  if (confirmMatch) {
    const orderId = confirmMatch[1] ?? ''
    await confirmPixPayment(client, orderId)
    return
  }

  if (recusarMatch) {
    const orderId = recusarMatch[1] ?? ''
    await refusePixPayment(client, orderId)
    return
  }
}

/**
 * Boleria aceitou o pedido mais antigo aguardando aprovação.
 */
async function acceptOrder(client: WppClient): Promise<void> {
  const order = await db.order.findFirst({
    where: { status: 'aguardando_aprovacao' },
    orderBy: { createdAt: 'asc' },
  })

  if (!order?.orderNumber) {
    await client.sendMessage(`${COMPANY_PHONE}@c.us`, 'Não há pedidos aguardando aprovação.')
    return
  }

  const orderId = String(order.orderNumber)

  if (order.paymentMethod === 'pix') {
    // Muda para aguardando pagamento e envia instruções Pix ao cliente
    await db.order.update({
      where: { id: order.id },
      data: { status: 'aguardando_pagamento' },
    })

    const pixMsg = formatPixInstructions(Math.round(order.total * 100), orderId)
    await client.sendMessage(
      `${order.customerPhone}@c.us`,
      `✅ *Pedido #${orderId} confirmado!*\n\n${pixMsg}\n\nMuito obrigada por comprar na *Tentação em Pedaços*! 🎂`,
    )
  } else {
    // Cartão ou dinheiro na entrega — pedido entra em produção
    await db.order.update({
      where: { id: order.id },
      data: { status: 'em_producao' },
    })

    const now = new Date()
    const prazo = order.deliveryTime.getDate() === now.getDate()
      ? 'hoje à tarde 🌤️'
      : 'amanhã pela manhã ☀️'

    const paymentLabel = order.paymentMethod === 'cartao_entrega' ? 'Cartão' : 'Dinheiro'
    const deliveryLabel = order.deliveryType === 'entrega' ? 'na entrega' : 'na retirada'

    await client.sendMessage(
      `${order.customerPhone}@c.us`,
      [
        `✅ *Pedido #${orderId} confirmado!*`,
        '',
        `💵 Total: R$ ${order.total.toFixed(2).replace('.', ',')}`,
        `💳 Pagamento: ${paymentLabel} ${deliveryLabel}`,
        `🕑 Previsão: ${prazo}`,
        '',
        'Muito obrigada por comprar na *Tentação em Pedaços*! Vai ser uma delícia! 🎂❤️',
      ].join('\n'),
    )
  }

  await client.sendMessage(`${COMPANY_PHONE}@c.us`, `✅ Pedido *#${orderId}* aceito!`)
}

/**
 * Boleria recusou o pedido com um motivo.
 */
async function rejectOrderWithReason(
  client: WppClient,
  orderNumber: number,
  reason: string,
): Promise<void> {
  const order = await db.order.findFirst({ where: { orderNumber } })
  if (!order) {
    console.warn(`[pedido] Pedido #${orderNumber} não encontrado.`)
    return
  }

  await db.order.update({
    where: { id: order.id },
    data: { status: 'cancelado', notaInterna: reason },
  })

  await client.sendMessage(
    `${order.customerPhone}@c.us`,
    `😔 Infelizmente não podemos confirmar o Pedido *#${orderNumber}* no momento.\n\n*Motivo:* ${reason}\n\nSe quiser fazer um novo pedido ou precisar de ajuda, é só chamar! 💜`,
  )

  await client.sendMessage(`${COMPANY_PHONE}@c.us`, `❌ Pedido *#${orderNumber}* recusado. Cliente notificado.`)
}

/**
 * Boleria confirmou o comprovante Pix (fluxo existente).
 */
async function confirmPixPayment(client: WppClient, orderId: string): Promise<void> {
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

/**
 * Boleria recusou o comprovante Pix (fluxo existente).
 */
async function refusePixPayment(client: WppClient, orderId: string): Promise<void> {
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
