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

// Estado em memória: rastreamento de etapa por telefone
const stageMap = new Map<string, string>()

// Cache do endereço salvo enquanto aguarda confirmação
const savedAddressCache = new Map<string, string>()

// Timers de inatividade por telefone
const inactivityTimers = new Map<string, ReturnType<typeof setTimeout>[]>()

const INACTIVITY_MSG_1 = (name: string) =>
  `Oi, *${name}*! 😊 Ainda está aí? Não deixa seu bolinho esfriar não! 🎂\nÉ só me contar o que escolheu!`

const INACTIVITY_MSG_2 = (name: string) =>
  `Psssiu... 🤫 Tô sentindo o cheirinho do bolo daqui, *${name}*! 😋\nVem cá completar seu pedido, não me deixa na mão! 🎂`

const INACTIVITY_MSG_CLOSE = (name: string) =>
  `Tudo bem, *${name}*! Obrigada pelo contato! 💜\nVou encerrar nossa conversa por enquanto — é só chamar quando estiver pronta(o) para o seu bolinho! Até logo! 🎂`

function clearInactivityTimers(phone: string): void {
  const timers = inactivityTimers.get(phone) ?? []
  timers.forEach(clearTimeout)
  inactivityTimers.delete(phone)
}

function setInactivityTimers(client: WppClient, phone: string, customerName: string): void {
  clearInactivityTimers(phone)
  const firstName = customerName.split(' ')[0] ?? customerName

  const t1 = setTimeout(async () => {
    try { await client.sendMessage(`${phone}@c.us`, INACTIVITY_MSG_1(firstName)) } catch { /* ignora */ }
  }, 2 * 60 * 1000)

  const t2 = setTimeout(async () => {
    try { await client.sendMessage(`${phone}@c.us`, INACTIVITY_MSG_2(firstName)) } catch { /* ignora */ }
  }, 5 * 60 * 1000)

  const t3 = setTimeout(async () => {
    try {
      await client.sendMessage(`${phone}@c.us`, INACTIVITY_MSG_CLOSE(firstName))
      stageMap.delete(phone)
      await saveHistory(phone, [])
    } catch { /* ignora */ }
  }, 10 * 60 * 1000)

  inactivityTimers.set(phone, [t1, t2, t3])
}

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
  const currentStage = stageMap.get(phone)

  // Qualquer mensagem do cliente cancela os timers de inatividade
  clearInactivityTimers(phone)

  // Etapa: aguardando o nome do cliente
  if (currentStage === 'awaiting_name') {
    const name = text
    await db.customer.upsert({
      where: { phone },
      create: { phone, name },
      update: { name },
    })
    stageMap.set(phone, 'main_menu')
    const replyText =
      `Prazer, *${name}*! 😊 O que posso fazer por você hoje? É só digitar o número:\n\n` +
      '1 - 🧁 Ver cardápio\n' +
      '2 - 🛒 Fazer um pedido\n' +
      '3 - 📦 Status do pedido\n' +
      '4 - ⭐ Programa de fidelidade\n' +
      '5 - 👩 Falar com atendente'
    await message.reply(replyText)
    setInactivityTimers(client, phone, name)
    return
  }

  // Primeira mensagem ou sem etapa definida — verifica se já conhecemos o cliente
  if (!text || !currentStage) {
    const existingCustomer = await db.customer.findUnique({ where: { phone } })
    if (existingCustomer?.name) {
      stageMap.set(phone, 'main_menu')
      const replyText =
        `Oi, *${existingCustomer.name}*! 😊 Seja bem-vindo(a) de volta à *Tentação em Pedaços*! Aqui é a Paty!\n\n` +
        'O que posso fazer por você? É só digitar o número:\n\n' +
        '1 - 🧁 Ver cardápio\n' +
        '2 - 🛒 Fazer um pedido\n' +
        '3 - 📦 Status do pedido\n' +
        '4 - ⭐ Programa de fidelidade\n' +
        '5 - 👩 Falar com atendente'
      await message.reply(replyText)
      setInactivityTimers(client, phone, existingCustomer.name)
    } else {
      stageMap.set(phone, 'awaiting_name')
      await message.reply(
        'Oi! 😊 Seja bem-vindo(a) à *Tentação em Pedaços*! Aqui é a Paty, tô aqui pra te ajudar!\n\n' +
        'Antes de tudo, pode me dizer seu *nome*? 😊',
      )
      setInactivityTimers(client, phone, 'você')
    }
    return
  }

  // Etapa: aguardando confirmação do endereço salvo
  if (currentStage === 'address_confirm') {
    const savedAddress = savedAddressCache.get(phone) ?? ''
    const existingCustomer = await db.customer.findUnique({ where: { phone } })
    const customerName = existingCustomer?.name ?? phone

    if (text === '1') {
      // Confirma endereço salvo — injeta na conversa e continua via LLM
      const history = await loadHistory(phone)
      const confirmedText = `Sim, pode entregar em ${savedAddress}`
      savedAddressCache.delete(phone)
      const response = await processMessage(phone, customerName, confirmedText, history, 'address')
      if (response.stage) stageMap.set(phone, response.stage)
      history.push({ role: 'user', text: confirmedText })
      history.push({ role: 'model', text: response.text })
      if (history.length > 20) history.splice(0, 2)
      await saveHistory(phone, history)
      await message.reply(response.text)
      if (response.orderCreated) await notifyBakeryNewOrder(client, response.orderCreated.orderNumber)
      if (response.stage !== 'done') setInactivityTimers(client, phone, customerName)
      else clearInactivityTimers(phone)
      return
    }

    if (text === '2') {
      // Cliente quer informar outro endereço
      savedAddressCache.delete(phone)
      stageMap.set(phone, 'address')
      await message.reply('Sem problema! Me passa o endereço completo: rua, número e bairro. 😊')
      setInactivityTimers(client, phone, customerName)
      return
    }

    // Resposta inválida — repete a pergunta
    const saved = savedAddressCache.get(phone) ?? ''
    await message.reply(
      `Não entendi! 😅 Você está no endereço *${saved}*?\n\n1 - ✅ Sim\n2 - 📝 Quero informar outro endereço`,
    )
    setInactivityTimers(client, phone, customerName)
    return
  }

  const history = await loadHistory(phone)

  try {
    const contact = await message.getContact()
    const customerNameFallback = contact.pushname || phone
    const existingCustomer = await db.customer.findUnique({ where: { phone } })
    const customerName = existingCustomer?.name || customerNameFallback

    const response = await processMessage(phone, customerName, text, history, currentStage)

    // Intercepta transição para "address": se cliente tem endereço salvo, sugere
    if (response.stage === 'address' && existingCustomer?.lastAddress) {
      const saved = existingCustomer.lastAddress
      savedAddressCache.set(phone, saved)
      stageMap.set(phone, 'address_confirm')
      const suggestionText =
        `Vi que você usou o endereço *${saved}* da última vez. Confirma a entrega aqui? 😊\n\n` +
        '1 - ✅ Sim\n' +
        '2 - 📝 Quero informar outro endereço'
      history.push({ role: 'user', text })
      history.push({ role: 'model', text: suggestionText })
      if (history.length > 20) history.splice(0, 2)
      await saveHistory(phone, history)
      await message.reply(suggestionText)
      setInactivityTimers(client, phone, customerName)
      return
    }

    if (response.stage) {
      stageMap.set(phone, response.stage)
    }

    history.push({ role: 'user', text })
    history.push({ role: 'model', text: response.text })
    if (history.length > 20) history.splice(0, 2)
    await saveHistory(phone, history)

    await message.reply(response.text)

    if (response.orderCreated) {
      await notifyBakeryNewOrder(client, response.orderCreated.orderNumber)
    }

    if (response.transferToAttendant) {
      clearInactivityTimers(phone)
      await notifyAttendant(client, phone, customerName, 'Cliente solicitou atendimento humano.')
    } else if (response.stage === 'done') {
      clearInactivityTimers(phone)
    } else {
      setInactivityTimers(client, phone, customerName)
    }

  } catch (err) {
    console.error(`[messageHandler] Erro ao processar mensagem de ${phone}:`, err)
    clearInactivityTimers(phone)
    stageMap.delete(phone)
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
