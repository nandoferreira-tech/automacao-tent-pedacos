import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { WppClient, WppMessage } from '../adapters/types.js'
import { getWhatsAppClient } from '../server.js'
import { validateDeliveryAddress } from '../tools/addressService.js'
import {
  formatAttendantNotification,
  formatOrderSummaryForBakery,
  formatPixInstructions,
} from '../tools/pixService.js'
import { db } from '../lib/db.js'
import { humanize } from '../lib/llmHumanizer.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FLOW_CONFIG_PATH = join(__dirname, '../../config/flow-messages.json')

// ─── Live-editable flow config ────────────────────────────────────────────────
// Dashboard writes to config/flow-messages.json; bot reads with 30 s cache.

let _configCache: Map<string, string> | null = null
let _configCacheTs = 0
const CONFIG_CACHE_TTL = 30_000

function getFlowMsg(id: string, fallback: string): string {
  const now = Date.now()
  if (!_configCache || now - _configCacheTs > CONFIG_CACHE_TTL) {
    _configCache = new Map()
    _configCacheTs = now
    try {
      if (existsSync(FLOW_CONFIG_PATH)) {
        const raw = readFileSync(FLOW_CONFIG_PATH, 'utf-8')
        const arr = JSON.parse(raw) as Array<{ id: string; message: string }>
        arr.forEach(item => _configCache!.set(item.id, item.message))
      }
    } catch { /* usa fallback */ }
  }
  return _configCache.get(id) ?? fallback
}

const COMPANY_PHONE = process.env['COMPANY_PHONE'] ?? ''
const CUTOFF_HOUR = Number(process.env['CUTOFF_HOUR'] ?? 11)
const SESSION_TIMEOUT_MIN = 15

// ─── Menu data ───────────────────────────────────────────────────────────────

const POTE = [
  { name: 'Bolo no Pote de Brigadeiro', price: 15 },
  { name: 'Bolo no Pote de Cenoura com Chocolate', price: 15 },
  { name: 'Bolo no Pote Red Velvet', price: 15 },
  { name: 'Bolo no Pote Floresta Negra', price: 15 },
]

const TRADICIONAL = [
  { name: 'Bolo de Cenoura', price: 25 },
  { name: 'Bolo de Laranja', price: 25 },
  { name: 'Bolo de Banana', price: 25 },
  { name: 'Bolo de Maçã', price: 25 },
  { name: 'Bolo de Limão', price: 25 },
  { name: 'Bolo de Fubá', price: 25 },
  { name: 'Bolo de Milho', price: 25 },
  { name: 'Bolo Formigueiro', price: 25 },
  { name: 'Bolo de Chocolate', price: 25 },
  { name: 'Bolo de Maracujá', price: 25 },
]

const ESPECIAL = [
  { name: 'Bolo de Cenoura com gotas de Chocolate', price: 31 },
  { name: 'Bolo de Fubá com pedaços de Goiabada', price: 31 },
  { name: 'Bolo de Iogurte com Frutas Vermelhas', price: 43 },
  { name: 'Bolo de Frutas Cristalizadas', price: 31 },
  { name: 'Bolo de Paçoca', price: 31 },
  { name: 'Bolo de Banana com Aveia', price: 43 },
  { name: 'Bolo de Chocolate com Paçoca', price: 31 },
  { name: 'Bolo de Leite em Pó', price: 50 },
  { name: 'Bolo de Cenoura com Brigadeiro', price: 43 },
  { name: 'Bolo de Banana com Doce de Leite', price: 33 },
]

const COBERTURAS = [
  'Chocolate',
  'Brigadeiro de Paçoca',
  'Casquinha de Limão/Laranja',
  'Brigadeiro Branco/Preto',
  'Geléia de Goiaba',
  'Beijinho',
]
const COBERTURA_PRICE = 8.75

// ─── Types ───────────────────────────────────────────────────────────────────

interface OrderDraft {
  productName: string | null
  productPrice: number | null
  coberturaName: string | null   // null = não aplicável (pote), 'sem cobertura' = recusou
  coberturaPrice: number
  deliveryType: 'entrega' | 'retirada' | null
  address: string | null
  mapsUrl: string | null
  paymentMethod?: string
}

interface ConvCtx {
  draft: OrderDraft
  savedAddress: string | null
}

function emptyDraft(): OrderDraft {
  return { productName: null, productPrice: null, coberturaName: null, coberturaPrice: 0, deliveryType: null, address: null, mapsUrl: null }
}
function emptyCtx(): ConvCtx { return { draft: emptyDraft(), savedAddress: null } }

// ─── DB helpers ──────────────────────────────────────────────────────────────

async function getConv(phone: string) {
  return db.conversation.findUnique({ where: { phone } })
}

async function setState(phone: string, state: string, ctx?: ConvCtx): Promise<void> {
  await db.conversation.upsert({
    where: { phone },
    create: { phone, state, context: JSON.stringify(ctx ?? emptyCtx()), history: '[]' },
    update: { state, ...(ctx !== undefined ? { context: JSON.stringify(ctx) } : {}) },
  })
}

async function getCtx(phone: string): Promise<ConvCtx> {
  const conv = await getConv(phone)
  if (!conv?.context || conv.context === '{}') return emptyCtx()
  try { return JSON.parse(conv.context) as ConvCtx } catch { return emptyCtx() }
}

// ─── Inactivity timers ───────────────────────────────────────────────────────

const timersMap = new Map<string, ReturnType<typeof setTimeout>[]>()

function clearTimers(phone: string) {
  const ts = timersMap.get(phone) ?? []
  ts.forEach(clearTimeout)
  timersMap.delete(phone)
}

function startTimers(client: WppClient, phone: string, name: string) {
  clearTimers(phone)
  const first = name.split(' ')[0] ?? name

  const t1 = setTimeout(async () => {
    try { await client.sendMessage(`${phone}@c.us`, `Oi, *${first}*! 😊 Ainda está aí? Não deixa seu bolinho esfriar não! 🎂\nÉ só me contar o que escolheu!`) } catch { /* ignore */ }
  }, 2 * 60 * 1000)

  const t2 = setTimeout(async () => {
    try { await client.sendMessage(`${phone}@c.us`, `Psssiu... 🤫 Tô sentindo o cheirinho do bolo daqui, *${first}*! 😋\nVem cá completar seu pedido, não me deixa na mão! 🎂`) } catch { /* ignore */ }
  }, 5 * 60 * 1000)

  const t3 = setTimeout(async () => {
    try {
      const timeoutTpl = getFlowMsg('timeout_close', 'Tudo bem, *{nome}*! Obrigada pelo contato! 💜\nVou encerrar nossa conversa por enquanto — é só chamar quando estiver pronta(o)! Até logo! 🎂')
      await client.sendMessage(`${phone}@c.us`, timeoutTpl.replace('{nome}', first))
      await setState(phone, 'main_menu', emptyCtx())
    } catch { /* ignore */ }
    timersMap.delete(phone)
  }, 10 * 60 * 1000)

  timersMap.set(phone, [t1, t2, t3])
}

// ─── Message templates ───────────────────────────────────────────────────────

const MAIN_MENU = (firstName: string) =>
  `O que posso fazer por você, *${firstName}*? É só digitar o número:\n\n` +
  '1 - 🧁 Ver cardápio\n' +
  '2 - 🛒 Fazer um pedido\n' +
  '3 - 📦 Status do pedido\n' +
  '4 - ⭐ Programa de fidelidade\n' +
  '5 - 👩 Falar com atendente'

const CATEGORY_ITEMS =
  '1 - 🍯 No Pote\n' +
  '2 - 🎂 Tradicionais\n' +
  '3 - ✨ Especiais'

const CATEGORY_MENU = 'Ótimo! Qual bolo você prefere?\n\n' + CATEGORY_ITEMS

const COBERTURA_MENU =
  'Deseja adicionar uma cobertura? (+R$ 8,75) 😋\n\n' +
  COBERTURAS.map((c, i) => `${i + 1} - ${c}`).join('\n') + '\n7 - Sem cobertura'

const FULL_CARDAPIO =
  '🎂 *Cardápio — Tentação em Pedaços*\n\n' +
  '🍯 *Bolos no Pote* — R$ 15,00\n' +
  POTE.map((p, i) => `  ${i + 1}. ${p.name}`).join('\n') + '\n\n' +
  '🎂 *Bolos Artesanais Tradicionais* — R$ 25,00\n' +
  '  + cobertura opcional: +R$ 8,75\n' +
  TRADICIONAL.map((p, i) => `  ${i + 1}. ${p.name}`).join('\n') + '\n\n' +
  '✨ *Bolos Artesanais Especiais*\n' +
  ESPECIAL.map((p, i) => `  ${i + 1}. ${p.name} — R$ ${p.price.toFixed(2).replace('.', ',')}`).join('\n') + '\n\n' +
  '🍰 *Coberturas disponíveis* (+R$ 8,75):\n' +
  COBERTURAS.map(c => `  • ${c}`).join('\n')

function deliveryTime(): Date {
  const now = new Date()
  if (now.getHours() < CUTOFF_HOUR) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0, 0)
  }
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 9, 0, 0)
}

function prazoLabel(dt: Date): string {
  const now = new Date()
  return dt.getDate() === now.getDate() ? 'hoje à tarde ☀️' : 'amanhã pela manhã 🌤️'
}

function buildSummaryAndPayment(draft: OrderDraft): string {
  const dt = deliveryTime()
  const total = (draft.productPrice ?? 0) + draft.coberturaPrice
  const produto = draft.coberturaName && draft.coberturaName !== 'sem cobertura'
    ? `${draft.productName} + Cobertura ${draft.coberturaName}`
    : draft.productName ?? ''
  const entrega = draft.deliveryType === 'entrega'
    ? `📍 Entrega: ${draft.address}`
    : '📍 Retirada na loja'
  const tipo = draft.deliveryType === 'entrega' ? 'entrega' : 'retirada'
  return [
    '📋 *Resumo do seu pedido:*',
    '',
    `🎂 ${produto}`,
    `💵 Total: R$ ${total.toFixed(2).replace('.', ',')}`,
    entrega,
    `⏰ Previsão: ${prazoLabel(dt)}`,
    '',
    'Confirma? Escolha a forma de pagamento:',
    '',
    '1 - 💰 Pix',
    `2 - 💳 Cartão na ${tipo}`,
    `3 - 💵 Dinheiro na ${tipo}`,
  ].join('\n')
}

// ─── Pending refusal (bakery) ─────────────────────────────────────────────────

let pendingRefusalOrderNumber: number | null = null

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function handleMessage(client: WppClient, message: WppMessage): Promise<void> {
  // Resolve número real via getContact() — message.from pode retornar @lid em modo multi-device
  // contact.number sempre retorna o telefone real (ex: 5511984380212)
  let phone: string
  try {
    const contact = await message.getContact()
    phone = contact.number && contact.number.length >= 10
      ? contact.number
      : message.from.replace(/@[a-z.]+$/i, '')
  } catch {
    phone = message.from.replace(/@[a-z.]+$/i, '')
  }
  const isCompany = phone === COMPANY_PHONE

  if (isCompany) {
    await handleAttendantCommand(client, message)
    return
  }

  if (message.hasMedia) {
    await handleComprovante(client, message, phone)
    return
  }

  await handleText(client, message, phone)
}

// ─── Text message dispatcher ──────────────────────────────────────────────────

async function handleText(client: WppClient, message: WppMessage, phone: string): Promise<void> {
  const text = message.body.trim()
  clearTimers(phone)

  const conv = await getConv(phone)
  const state = conv?.state ?? 'new'
  const ctx = await getCtx(phone)
  const customer = await db.customer.findUnique({ where: { phone } })
  const customerName = customer?.name

  // Timeout check: if mid-order and session expired → reset
  if (state !== 'new' && state !== 'main_menu' && conv?.updatedAt) {
    const minutesAgo = (Date.now() - conv.updatedAt.getTime()) / 60000
    if (minutesAgo > SESSION_TIMEOUT_MIN) {
      await setState(phone, 'main_menu', emptyCtx())
      const first = customerName?.split(' ')[0] ?? 'você'
      if (customerName) {
        const baseWelcome = `Oi, *${first}*! 😊 Que saudade! Sua sessão anterior expirou, mas estou aqui pra te ajudar de novo!\n\n${MAIN_MENU(first)}`
        const welcomeMsg = await humanize(baseWelcome, `session expired welcome back for ${first}`)
        await message.reply(welcomeMsg)
        startTimers(client, phone, customerName)
      } else {
        await setState(phone, 'awaiting_name', emptyCtx())
        await message.reply('Oi! 😊 Seja bem-vindo(a) à *Tentação em Pedaços*! Aqui é a Paty, tô aqui pra te ajudar!\n\nPode me dizer seu *nome*? 😊')
      }
      return
    }
  }

  try {
    switch (state) {
      case 'new':
        await handleNew(client, message, phone, text, customerName)
        break
      case 'main_menu':
        await handleMainMenu(client, message, phone, text, customerName)
        break
      case 'awaiting_name':
        await handleAwaitingName(client, message, phone, text)
        break
      case 'category_select':
        await handleCategorySelect(client, message, phone, text, ctx, customerName ?? phone)
        break
      case 'product_pote':
        await handleProductPote(client, message, phone, text, ctx, customerName ?? phone)
        break
      case 'product_tradicional':
        await handleProductTradicional(client, message, phone, text, ctx, customerName ?? phone)
        break
      case 'product_especial':
        await handleProductEspecial(client, message, phone, text, ctx, customerName ?? phone)
        break
      case 'cobertura':
        await handleCobertura(client, message, phone, text, ctx, customerName ?? phone, customer?.lastAddress ?? null)
        break
      case 'delivery_type':
        await handleDeliveryType(client, message, phone, text, ctx, customer?.lastAddress ?? null)
        break
      case 'address_confirm':
        await handleAddressConfirm(client, message, phone, text, ctx)
        break
      case 'address_input':
        await handleAddressInput(client, message, phone, text, ctx)
        break
      case 'payment':
        await handlePayment(client, message, phone, text, ctx, customerName ?? phone)
        break
      default:
        await handleNew(client, message, phone, text, customerName)
    }
  } catch (err) {
    console.error(`[messageHandler] Erro de ${phone}:`, err)
    await setState(phone, 'main_menu', emptyCtx())
    clearTimers(phone)
    const first = customerName?.split(' ')[0] ?? 'você'
    await message.reply(
      `Opa, tive um probleminha técnico! 😅 Reiniciei nossa conversa.\n\n${MAIN_MENU(first)}`
    )
  }
}

// ─── State handlers ───────────────────────────────────────────────────────────

async function handleNew(client: WppClient, message: WppMessage, phone: string, text: string, customerName: string | undefined) {
  if (!customerName) {
    await setState(phone, 'awaiting_name', emptyCtx())
    const newMsg = getFlowMsg('welcome_new', 'Oi! 😊 Seja bem-vindo(a) à *Tentação em Pedaços*! Aqui é a Paty, tô aqui pra te ajudar!\n\nPode me dizer seu *nome*? 😊')
    await message.reply(newMsg)
    return
  }
  const first = customerName.split(' ')[0]!
  await setState(phone, 'main_menu', emptyCtx())
  const isGreeting = /^(oi|olá|ola|bom dia|boa tarde|boa noite|hey|hi|hello|e aí|e ai|tudo bem)/i.test(text)
  const backTemplate = getFlowMsg('welcome_back', `Oi, *${first}*! 😊 Seja bem-vindo(a) de volta à *Tentação em Pedaços*! Aqui é a Paty!\n\n`)
  const baseGreeting = isGreeting ? backTemplate.replace('{nome}', first) : ''
  const greeting = isGreeting ? await humanize(baseGreeting, `welcome back greeting for ${first}`) : ''
  await message.reply(greeting + MAIN_MENU(first))
  startTimers(client, phone, customerName)
}

function matchProductFromText(text: string): ({ name: string; price: number; category: 'pote' | 'tradicional' | 'especial' }) | null {
  const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  for (const p of POTE) {
    const key = normalize(p.name.replace('Bolo no Pote de ', '').replace('Bolo no Pote ', ''))
    if (t.includes(key)) return { ...p, category: 'pote' }
  }
  for (const p of ESPECIAL) {
    if (t.includes(normalize(p.name))) return { ...p, category: 'especial' }
  }
  for (const p of TRADICIONAL) {
    const key = normalize(p.name.replace('Bolo de ', '').replace('Bolo ', ''))
    if (t.includes(key)) return { ...p, category: 'tradicional' }
  }
  return null
}

async function handleMainMenu(client: WppClient, message: WppMessage, phone: string, text: string, customerName: string | undefined) {
  if (!customerName) {
    await setState(phone, 'awaiting_name', emptyCtx())
    await message.reply('Pode me dizer seu *nome*? 😊')
    return
  }
  const first = customerName.split(' ')[0]!

  switch (text) {
    case '1':
    case '2': {
      await setState(phone, 'category_select', emptyCtx())
      const catBase = getFlowMsg('category_menu', 'Ótimo! Qual bolo você prefere? 😊')
      const catIntro = await humanize(catBase, 'category menu intro')
      await message.reply(catIntro + '\n\n' + CATEGORY_ITEMS)
      startTimers(client, phone, customerName)
      break
    }
    case '3':
      await handleStatusQuery(message, phone)
      startTimers(client, phone, customerName)
      break
    case '4':
      await message.reply('⭐ O programa de fidelidade está em desenvolvimento!\nEm breve você vai acumular pontos a cada pedido. 💜')
      startTimers(client, phone, customerName)
      break
    case '5':
      await message.reply('Claro! Vou chamar um atendente para você. 😊\n\nUm momento, por favor...')
      clearTimers(phone)
      if (COMPANY_PHONE) {
        await client.sendMessage(`${COMPANY_PHONE}@c.us`, `🙋 *Atendimento solicitado*\n\nCliente: ${customerName} (${phone})\nMotivo: Solicitou atendimento humano`)
      }
      break
    default: {
      // Tenta identificar produto pelo texto livre antes de repetir o menu
      const matched = matchProductFromText(text)
      if (matched) {
        const newCtx = emptyCtx()
        newCtx.draft.productName = matched.name
        newCtx.draft.productPrice = matched.price
        if (matched.category === 'pote') {
          newCtx.draft.coberturaName = null
          newCtx.draft.coberturaPrice = 0
          await setState(phone, 'delivery_type', newCtx)
          await message.reply(
            `Boa escolha, *${first}*! 😋\n\n` +
            `Como você prefere receber seu *${matched.name}*?\n\n` +
            '1 - 🏠 Entrega\n' +
            '2 - 🏪 Retirada na loja'
          )
        } else {
          await setState(phone, 'cobertura', newCtx)
          await message.reply(`Boa escolha, *${first}*! 😋\n\n${COBERTURA_MENU}`)
        }
        startTimers(client, phone, customerName)
      } else if (/\b(bolo|pote|quero|pedido|comprar|encomendar)\b/i.test(text)) {
        // Intenção de pedido mas produto não identificado → vai para seleção de categoria
        await setState(phone, 'category_select', emptyCtx())
        await message.reply(`Não encontrei esse produto no cardápio. 😊 Veja as categorias disponíveis:\n\n${CATEGORY_MENU}`)
        startTimers(client, phone, customerName)
      } else {
        await message.reply(`Por favor, escolha uma das opções:\n\n${MAIN_MENU(first)}`)
        startTimers(client, phone, customerName)
      }
    }
  }
}

async function handleAwaitingName(client: WppClient, message: WppMessage, phone: string, text: string) {
  if (!text || text.length < 2) {
    await message.reply('Pode me dizer seu *nome*, por favor? 😊')
    return
  }
  const name = text.trim()
  await db.customer.upsert({
    where: { phone },
    create: { phone, name },
    update: { name },
  })
  await setState(phone, 'main_menu', emptyCtx())
  const first = name.split(' ')[0]!
  const prazerMsg = await humanize(`Prazer, *${first}*! 😊\n\n${MAIN_MENU(first)}`, `first welcome after name ${first}`)
  await message.reply(prazerMsg)
  startTimers(client, phone, name)
}

// Remove "Bolo no Pote de / Bolo de / Bolo " do início do nome para exibição curta
const short = (n: string) => n
  .replace(/^Bolo no Pote de /i, '')
  .replace(/^Bolo no Pote /i, '')
  .replace(/^Bolo de /i, '')
  .replace(/^Bolo /i, '')

async function handleCategorySelect(client: WppClient, message: WppMessage, phone: string, text: string, ctx: ConvCtx, name: string) {
  switch (text) {
    case '1':
      await setState(phone, 'product_pote', ctx)
      await message.reply('🍯 *Bolos no Pote* — R$ 15,00\n\n' + POTE.map((p, i) => `${i + 1} - ${short(p.name)}`).join('\n'))
      startTimers(client, phone, name)
      break
    case '2':
      await setState(phone, 'product_tradicional', ctx)
      await message.reply('🎂 *Artesanais Tradicionais* — R$ 25,00\n\n' + TRADICIONAL.map((p, i) => `${i + 1} - ${short(p.name)}`).join('\n'))
      startTimers(client, phone, name)
      break
    case '3':
      await setState(phone, 'product_especial', ctx)
      await message.reply('✨ *Artesanais Especiais*\n\n' + ESPECIAL.map((p, i) => `${i + 1} - ${short(p.name)} — R$ ${p.price.toFixed(2).replace('.', ',')}`).join('\n'))
      startTimers(client, phone, name)
      break
    default:
      await message.reply('Por favor, escolha 1, 2 ou 3. 😊\n\n' + CATEGORY_MENU)
      startTimers(client, phone, name)
  }
}

async function handleProductPote(client: WppClient, message: WppMessage, phone: string, text: string, ctx: ConvCtx, name: string) {
  const idx = parseInt(text) - 1
  const product = POTE[idx]
  if (!product) {
    await message.reply(`Por favor, escolha uma opção de 1 a ${POTE.length}. 😊`)
    startTimers(client, phone, name)
    return
  }
  ctx.draft.productName = product.name
  ctx.draft.productPrice = product.price
  ctx.draft.coberturaName = null  // pote não tem cobertura
  ctx.draft.coberturaPrice = 0
  const first = name.split(' ')[0]!
  await setState(phone, 'delivery_type', ctx)
  await message.reply(
    `Boa escolha, *${first}*! 😋\n\n` +
    `Como você prefere receber seu *${product.name}*?\n\n` +
    '1 - 🏠 Entrega\n' +
    '2 - 🏪 Retirada na loja'
  )
  startTimers(client, phone, name)
}

async function handleProductTradicional(client: WppClient, message: WppMessage, phone: string, text: string, ctx: ConvCtx, name: string) {
  const idx = parseInt(text) - 1
  const product = TRADICIONAL[idx]
  if (!product) {
    await message.reply(`Por favor, escolha uma opção de 1 a ${TRADICIONAL.length}. 😊`)
    startTimers(client, phone, name)
    return
  }
  ctx.draft.productName = product.name
  ctx.draft.productPrice = product.price
  await setState(phone, 'cobertura', ctx)
  await message.reply(`Boa escolha! 😋\n\n${COBERTURA_MENU}`)
  startTimers(client, phone, name)
}

async function handleProductEspecial(client: WppClient, message: WppMessage, phone: string, text: string, ctx: ConvCtx, name: string) {
  const idx = parseInt(text) - 1
  const product = ESPECIAL[idx]
  if (!product) {
    await message.reply(`Por favor, escolha uma opção de 1 a ${ESPECIAL.length}. 😊`)
    startTimers(client, phone, name)
    return
  }
  ctx.draft.productName = product.name
  ctx.draft.productPrice = product.price
  await setState(phone, 'cobertura', ctx)
  await message.reply(`Boa escolha! 😋\n\n${COBERTURA_MENU}`)
  startTimers(client, phone, name)
}

async function handleCobertura(client: WppClient, message: WppMessage, phone: string, text: string, ctx: ConvCtx, name: string, savedAddress: string | null) {
  const num = parseInt(text)
  if (num === 7) {
    ctx.draft.coberturaName = 'sem cobertura'
    ctx.draft.coberturaPrice = 0
  } else if (num >= 1 && num <= COBERTURAS.length) {
    ctx.draft.coberturaName = COBERTURAS[num - 1]!
    ctx.draft.coberturaPrice = COBERTURA_PRICE
  } else {
    await message.reply(`Por favor, escolha uma opção de 1 a 7. 😊\n\n${COBERTURA_MENU}`)
    startTimers(client, phone, name)
    return
  }
  const first = name.split(' ')[0]!
  const produto = ctx.draft.coberturaName !== 'sem cobertura'
    ? `${ctx.draft.productName} + Cobertura ${ctx.draft.coberturaName}`
    : ctx.draft.productName ?? ''
  await setState(phone, 'delivery_type', ctx)
  await message.reply(
    `Perfeito, *${first}*! 😋\n\n` +
    `Como você prefere receber seu *${produto}*?\n\n` +
    '1 - 🏠 Entrega\n' +
    '2 - 🏪 Retirada na loja'
  )
  startTimers(client, phone, name)
}

async function handleDeliveryType(client: WppClient, message: WppMessage, phone: string, text: string, ctx: ConvCtx, savedAddress: string | null) {
  if (text === '1') {
    // Entrega
    if (savedAddress) {
      ctx.savedAddress = savedAddress
      await setState(phone, 'address_confirm', ctx)
      const confirmTpl = getFlowMsg('address_confirm', 'Vi que você usou o endereço *{endereço}* da última vez. Confirma a entrega aqui? 😊')
      await message.reply(
        confirmTpl.replace('{endereço}', savedAddress) + '\n\n' +
        '1 - ✅ Sim\n' +
        '2 - 📝 Quero informar outro endereço'
      )
    } else {
      await setState(phone, 'address_input', ctx)
      await message.reply(getFlowMsg('address_input', 'Me passa o endereço completo: rua, número e bairro. 😊'))
    }
  } else if (text === '2') {
    // Retirada
    ctx.draft.deliveryType = 'retirada'
    await setState(phone, 'payment', ctx)
    await message.reply(
      '📍 *Rua Padre Carvalho, 388*\nhttps://maps.google.com/?q=Rua+Padre+Carvalho,+388,+São+Paulo\n\n' +
      buildSummaryAndPayment(ctx.draft)
    )
  } else {
    await message.reply('Por favor, escolha:\n\n1 - 🏠 Entrega\n2 - 🏪 Retirada na loja')
  }
  const customerName = (await db.customer.findUnique({ where: { phone } }))?.name ?? phone
  startTimers(client, phone, customerName)
}

async function handleAddressConfirm(client: WppClient, message: WppMessage, phone: string, text: string, ctx: ConvCtx) {
  const customerName = (await db.customer.findUnique({ where: { phone } }))?.name ?? phone
  if (text === '1') {
    // Usa endereço salvo — mas ainda precisa validar (pode ter saído da área)
    const saved = ctx.savedAddress ?? ''
    const result = await validateDeliveryAddress(saved)
    if (!result.valid && result.error !== 'Endereço não encontrado') {
      // Fora da área
      ctx.savedAddress = null
      await setState(phone, 'delivery_type', ctx)
      await message.reply(
        `Que pena! 😔 O endereço *${result.formattedAddress}* está fora da nossa área de entrega (${result.distanceKm} km).\n\n` +
        'Deseja informar outro endereço ou fazer retirada na loja?\n\n' +
        '1 - 🏠 Outro endereço de entrega\n2 - 🏪 Retirada na loja'
      )
    } else {
      ctx.draft.deliveryType = 'entrega'
      ctx.draft.address = result.formattedAddress || saved
      ctx.draft.mapsUrl = result.lat && result.lng
        ? `https://www.google.com/maps?q=${result.lat},${result.lng}`
        : `https://maps.google.com/?q=${encodeURIComponent(result.formattedAddress || saved)}`
      await setState(phone, 'payment', ctx)
      await message.reply(buildSummaryAndPayment(ctx.draft))
    }
    startTimers(client, phone, customerName)
  } else if (text === '2') {
    ctx.savedAddress = null
    await setState(phone, 'address_input', ctx)
    await message.reply(getFlowMsg('address_input', 'Me passa o endereço completo: rua, número e bairro. 😊'))
    startTimers(client, phone, customerName)
  } else {
    const saved = ctx.savedAddress ?? ''
    await message.reply(`Não entendi! 😅\n\nVocê confirma a entrega em *${saved}*?\n\n1 - ✅ Sim\n2 - 📝 Outro endereço`)
    startTimers(client, phone, customerName)
  }
}

async function handleAddressInput(client: WppClient, message: WppMessage, phone: string, text: string, ctx: ConvCtx) {
  const customerName = (await db.customer.findUnique({ where: { phone } }))?.name ?? phone
  const result = await validateDeliveryAddress(text)

  if (result.error === 'Endereço não encontrado') {
    await message.reply('Hmm, não consegui localizar esse endereço no mapa. 🗺️\n\nPode conferir? Me passa a rua, número e bairro novamente. 😊')
    startTimers(client, phone, customerName)
    return
  }

  if (!result.valid) {
    // Fora da área — oferecer retirada
    ctx.savedAddress = null
    await setState(phone, 'delivery_type', ctx)
    await message.reply(
      `Que pena! 😔 O endereço *${result.formattedAddress}* está fora da nossa área de entrega (${result.distanceKm} km da loja).\n\n` +
      'Mas não precisa ficar sem seu bolinho! Você pode retirar na loja:\n' +
      '📍 *Rua Padre Carvalho, 388*\nhttps://maps.google.com/?q=Rua+Padre+Carvalho,+388,+São+Paulo\n\n' +
      'Deseja:\n1 - 🏠 Informar outro endereço\n2 - 🏪 Retirada na loja'
    )
    startTimers(client, phone, customerName)
    return
  }

  ctx.draft.deliveryType = 'entrega'
  ctx.draft.address = result.formattedAddress
  ctx.draft.mapsUrl = result.lat && result.lng
    ? `https://www.google.com/maps?q=${result.lat},${result.lng}`
    : `https://maps.google.com/?q=${encodeURIComponent(result.formattedAddress || text)}`
  await setState(phone, 'payment', ctx)
  await message.reply(
    `✅ Ótimo! Entregamos em *${result.formattedAddress}* (${result.distanceKm} km da loja).\n\n` +
    buildSummaryAndPayment(ctx.draft)
  )
  startTimers(client, phone, customerName)
}

async function handlePayment(client: WppClient, message: WppMessage, phone: string, text: string, ctx: ConvCtx, customerName: string) {
  const tipo = ctx.draft.deliveryType === 'entrega' ? 'entrega' : 'retirada'
  let paymentMethod: string
  switch (text) {
    case '1': paymentMethod = 'pix'; break
    case '2': paymentMethod = `cartao_${tipo}`; break
    case '3': paymentMethod = `dinheiro_${tipo}`; break
    default:
      await message.reply(`Por favor, escolha:\n\n1 - 💰 Pix\n2 - 💳 Cartão na ${tipo}\n3 - 💵 Dinheiro na ${tipo}`)
      startTimers(client, phone, customerName)
      return
  }

  // Create order
  const dt = deliveryTime()
  const total = (ctx.draft.productPrice ?? 0) + ctx.draft.coberturaPrice
  const lastOrder = await db.order.findFirst({ orderBy: { orderNumber: 'desc' }, where: { orderNumber: { not: null } } })
  const orderNumber = (lastOrder?.orderNumber ?? 0) + 1

  await db.customer.upsert({
    where: { phone },
    create: { phone, name: customerName },
    update: {},
  })

  // Resolve products
  const productItems: { productName: string; unitPrice: number }[] = []
  if (ctx.draft.productName) productItems.push({ productName: ctx.draft.productName, unitPrice: ctx.draft.productPrice ?? 0 })
  if (ctx.draft.coberturaName && ctx.draft.coberturaName !== 'sem cobertura') {
    productItems.push({ productName: `Cobertura ${ctx.draft.coberturaName}`, unitPrice: COBERTURA_PRICE })
  }

  const resolvedItems = await Promise.all(
    productItems.map(async (item) => {
      let product = await db.product.findFirst({ where: { name: { contains: item.productName } } })
      if (!product) product = await db.product.create({ data: { name: item.productName, category: 'outros', price: item.unitPrice } })
      return { productId: product.id, quantity: 1, unitPrice: item.unitPrice }
    })
  )

  const order = await db.order.create({
    data: {
      customerPhone: phone, // número real resolvido via getContact() — sem @lid
      customerName,
      deliveryType: ctx.draft.deliveryType ?? 'retirada',
      address: ctx.draft.address,
      paymentMethod,
      total,
      orderNumber,
      deliveryTime: dt,
      status: 'aguardando_aprovacao',
      items: { create: resolvedItems },
    },
  })

  // Save last address
  if (ctx.draft.deliveryType === 'entrega' && ctx.draft.address) {
    await db.customer.update({ where: { phone }, data: { lastAddress: ctx.draft.address } })
  }

  const mapsUrl = ctx.draft.mapsUrl

  // Reset conversation
  await setState(phone, 'main_menu', emptyCtx())
  clearTimers(phone)

  await message.reply(
    `🎂 *Pedido #${orderNumber} recebido!*\n\n` +
    `💵 Total: R$ ${total.toFixed(2).replace('.', ',')}\n\n` +
    'Estamos confirmando com a equipe. Em instantes você receberá a confirmação! 😊'
  )

  // Notify bakery
  await notifyBakeryNewOrder(client, order.id, orderNumber, mapsUrl)
}

// ─── Status query ─────────────────────────────────────────────────────────────

async function handleStatusQuery(message: WppMessage, phone: string) {
  const order = await db.order.findFirst({
    where: { customerPhone: phone, status: { notIn: ['entregue', 'cancelado'] } },
    orderBy: { createdAt: 'desc' },
    include: { items: { include: { product: true } } },
  })
  if (!order?.orderNumber) {
    await message.reply('Não encontrei nenhum pedido ativo no momento. 😊\n\nSe precisar de ajuda é só chamar!')
    return
  }
  const statusLabel: Record<string, string> = {
    aguardando_aprovacao: '⏳ Aguardando confirmação da equipe',
    aguardando_pagamento: '💰 Aguardando pagamento Pix',
    pago: '✅ Pagamento confirmado',
    em_producao: '👩‍🍳 Em produção',
    pronto: '✅ Pronto para retirada / saindo para entrega',
    saiu_entrega: '🛵 Saiu para entrega',
  }
  const status = statusLabel[order.status] ?? order.status
  const itemsText = order.items.map(i => i.product.name).join(', ')
  const deliveryLabel = order.deliveryType === 'entrega' ? `Entrega: ${order.address}` : 'Retirada na loja'
  await message.reply([
    `📦 *Pedido #${order.orderNumber}*`,
    `Status: ${status}`,
    `Pedido: ${itemsText}`,
    `Total: R$ ${order.total.toFixed(2).replace('.', ',')}`,
    deliveryLabel,
  ].join('\n'))
}

// ─── Bakery notification ──────────────────────────────────────────────────────

async function notifyBakeryNewOrder(client: WppClient, orderId: string, orderNumber: number, mapsUrl: string | null): Promise<void> {
  if (!COMPANY_PHONE) return
  const order = await db.order.findFirst({
    where: { id: orderId },
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
    ...(mapsUrl != null ? { mapsUrl } : {}),
  })
  await client.sendMessage(`${COMPANY_PHONE}@c.us`, summary)
}

// ─── Comprovante Pix ──────────────────────────────────────────────────────────

async function handleComprovante(client: WppClient, message: WppMessage, phone: string): Promise<void> {
  const order = await db.order.findFirst({
    where: { customerPhone: phone, paymentMethod: 'pix', status: 'aguardando_pagamento' },
    orderBy: { createdAt: 'desc' },
  })
  if (!order?.orderNumber) {
    await message.reply('Não encontrei nenhum pedido aguardando pagamento. Se precisar de ajuda, é só chamar! 😊')
    return
  }
  const orderId = String(order.orderNumber)
  const notification = formatAttendantNotification(phone, order.customerName, orderId, Math.round(order.total * 100))
  const companyContact = `${COMPANY_PHONE}@c.us`
  await client.sendMessage(companyContact, notification)
  const media = await message.downloadMedia()
  if (media) {
    await client.sendMessage(companyContact, media, { caption: `Comprovante de ${order.customerName} (${phone}) — Pedido #${orderId}` })
  }
  await db.order.update({ where: { id: order.id }, data: { comprovanteStatus: 'pendente' } })
  await message.reply('✅ Comprovante recebido! Estamos validando seu pagamento.\nEm breve confirmaremos seu pedido. 🎂')
}

// ─── Attendant commands (bakery side) ─────────────────────────────────────────

async function handleAttendantCommand(client: WppClient, message: WppMessage): Promise<void> {
  const text = message.body.trim()
  const lower = text.toLowerCase()

  if (pendingRefusalOrderNumber !== null) {
    const isCommand = /^(1|2|confirmar|recusar)\b/.test(lower)
    if (!isCommand) {
      await rejectOrderWithReason(client, pendingRefusalOrderNumber, text)
      pendingRefusalOrderNumber = null
      return
    }
  }

  if (lower === '1') { await acceptOrder(client); return }

  if (lower === '2') {
    const order = await db.order.findFirst({ where: { status: 'aguardando_aprovacao' }, orderBy: { createdAt: 'asc' } })
    if (!order?.orderNumber) {
      await client.sendMessage(`${COMPANY_PHONE}@c.us`, 'Não há pedidos aguardando aprovação.')
      return
    }
    pendingRefusalOrderNumber = order.orderNumber
    await client.sendMessage(`${COMPANY_PHONE}@c.us`, `Ok! Qual o motivo da recusa do Pedido *#${order.orderNumber}*?\nDigite o motivo na próxima mensagem.`)
    return
  }

  // Reiniciar serviço via WhatsApp
  const reiniciarMatch = lower.match(/^reiniciar\s+(\S+)/)
  if (reiniciarMatch) {
    const serviceId = reiniciarMatch[1] ?? ''
    await handleRestartService(client, serviceId)
    return
  }

  const confirmMatch = lower.match(/^confirmar\s+(\S+)/)
  const recusarMatch = lower.match(/^recusar\s+(\S+)/)
  if (confirmMatch) { await confirmPixPayment(client, confirmMatch[1] ?? ''); return }
  if (recusarMatch) { await refusePixPayment(client, recusarMatch[1] ?? ''); return }
}

async function handleRestartService(client: WppClient, serviceId: string): Promise<void> {
  const { exec } = await import('child_process')
  const RESTART_COMMANDS: Record<string, string> = {
    'agente-prod':       'pm2 restart agente-prod',
    'dashboard-prod':    'pm2 restart dashboard-prod',
    'agente-homolog':    'pm2 restart agente-homolog',
    'dashboard-homolog': 'pm2 restart dashboard-homolog',
    'traefik':   'docker restart $(docker ps -q --filter "name=proxy_traefik")',
    'postgres':  'docker restart $(docker ps -q --filter "name=netbox_postgres")',
    'redis':     'docker restart $(docker ps -q --filter "name=netbox_redis")',
  }
  const cmd = RESTART_COMMANDS[serviceId]
  if (!cmd) {
    await client.sendMessage(`${COMPANY_PHONE}@c.us`, `❌ Serviço *${serviceId}* não encontrado ou não pode ser reiniciado.`)
    return
  }
  await client.sendMessage(`${COMPANY_PHONE}@c.us`, `⏳ Reiniciando *${serviceId}*...`)
  exec(cmd, async (err) => {
    if (err) {
      await client.sendMessage(`${COMPANY_PHONE}@c.us`, `❌ Erro ao reiniciar *${serviceId}*: ${err.message}`)
    } else {
      await client.sendMessage(`${COMPANY_PHONE}@c.us`, `✅ Serviço *${serviceId}* reiniciado com sucesso!`)
    }
  })
}

/** Normaliza o telefone para o formato esperado pelo WhatsApp (55 + número). */
function normalizePhone(raw: string): string {
  // Remove tudo que não é dígito
  const digits = raw.replace(/\D/g, '')
  // Se já tem 55 no início e tem 12-13 dígitos → está correto
  if (digits.startsWith('55') && digits.length >= 12) return digits
  // Se tem 10-11 dígitos → é DDD + número sem código de país → adiciona 55
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`
  // Qualquer outro caso: retorna como está (não destrói um número já incomum)
  return digits
}

async function acceptOrder(passedClient: WppClient): Promise<void> {
  // Usa o cliente global (sempre atualizado) em vez do capturado no message event
  const client = getWhatsAppClient() ?? passedClient

  const order = await db.order.findFirst({ where: { status: 'aguardando_aprovacao' }, orderBy: { createdAt: 'asc' } })
  if (!order?.orderNumber) {
    await client.sendMessage(`${COMPANY_PHONE}@c.us`, 'Não há pedidos aguardando aprovação.')
    return
  }
  const orderId = String(order.orderNumber)

  const customerWaId = `${normalizePhone(order.customerPhone)}@c.us`
  console.log(`[acceptOrder] Pedido #${orderId} | cliente: ${order.customerPhone} → WA: ${customerWaId}`)

  if (order.paymentMethod === 'pix') {
    await db.order.update({ where: { id: order.id }, data: { status: 'aguardando_pagamento' } })
    const pixMsg = formatPixInstructions(Math.round(order.total * 100), orderId)
    try {
      await client.sendMessage(customerWaId, `✅ *Pedido #${orderId} confirmado!*\n\n${pixMsg}\n\nMuito obrigada por comprar na *Tentação em Pedaços*! 🎂`)
      console.log(`[acceptOrder] ✓ Pix instructions enviadas para ${customerWaId}`)
    } catch (err) {
      console.error(`[acceptOrder] ✗ Erro ao enviar Pix para ${customerWaId}:`, err)
      await client.sendMessage(`${COMPANY_PHONE}@c.us`, `⚠️ Pedido *#${orderId}* confirmado, mas falha ao notificar cliente. WA: ${customerWaId}`)
    }
  } else {
    await db.order.update({ where: { id: order.id }, data: { status: 'em_producao' } })
    const now = new Date()
    const prazo = order.deliveryTime.getDate() === now.getDate() ? 'hoje à tarde 🌤️' : 'amanhã pela manhã ☀️'
    const paymentLabel = order.paymentMethod.startsWith('cartao') ? 'Cartão' : 'Dinheiro'
    const deliveryLabel = order.deliveryType === 'entrega' ? 'na entrega' : 'na retirada'
    const thanksLine = await humanize(
      getFlowMsg('done', 'Muito obrigada por comprar na *Tentação em Pedaços*! Já está saindo uma fornada quentinha pra você! 🎂❤️'),
      `order confirmed thanks for ${order.customerName}`
    )
    const confirmMsg = [
      `✅ *Pedido #${orderId} confirmado!*`,
      '',
      `💵 Total: R$ ${order.total.toFixed(2).replace('.', ',')}`,
      `💳 Pagamento: ${paymentLabel} ${deliveryLabel}`,
      `🕑 Previsão: ${prazo}`,
      '',
      thanksLine,
    ].join('\n')
    try {
      await client.sendMessage(customerWaId, confirmMsg)
      console.log(`[acceptOrder] ✓ Confirmação enviada para ${customerWaId}`)
    } catch (err) {
      console.error(`[acceptOrder] ✗ Erro ao enviar confirmação para ${customerWaId}:`, err)
      await client.sendMessage(`${COMPANY_PHONE}@c.us`, `⚠️ Pedido *#${orderId}* aceito, mas falha ao notificar cliente. WA: ${customerWaId}`)
    }
  }
  await client.sendMessage(`${COMPANY_PHONE}@c.us`, `✅ Pedido *#${orderId}* aceito com sucesso!`)
}

async function rejectOrderWithReason(client: WppClient, orderNumber: number, reason: string): Promise<void> {
  const order = await db.order.findFirst({ where: { orderNumber } })
  if (!order) return
  await db.order.update({ where: { id: order.id }, data: { status: 'cancelado', notaInterna: reason } })
  await client.sendMessage(
    `${order.customerPhone}@c.us`,
    `😔 Infelizmente não podemos confirmar o Pedido *#${orderNumber}* no momento.\n\n*Motivo:* ${reason}\n\nSe quiser fazer um novo pedido, é só chamar! 💜`
  )
  await client.sendMessage(`${COMPANY_PHONE}@c.us`, `❌ Pedido *#${orderNumber}* recusado. Cliente notificado.`)
}

async function confirmPixPayment(client: WppClient, orderId: string): Promise<void> {
  const order = await db.order.findFirst({ where: { orderNumber: Number(orderId) } })
  if (!order) return
  await db.order.update({ where: { id: order.id }, data: { status: 'pago', comprovanteStatus: 'confirmado' } })
  await client.sendMessage(`${order.customerPhone}@c.us`, `✅ Pagamento do pedido *#${orderId}* confirmado! Seu pedido entrou na fila de produção. 🎂`)
}

async function refusePixPayment(client: WppClient, orderId: string): Promise<void> {
  const order = await db.order.findFirst({ where: { orderNumber: Number(orderId) } })
  if (!order) return
  await db.order.update({ where: { id: order.id }, data: { status: 'aguardando_pagamento', comprovanteStatus: 'recusado' } })
  await client.sendMessage(`${order.customerPhone}@c.us`, `❌ Não conseguimos validar o comprovante do pedido *#${orderId}*.\n\nPor favor, envie novamente ou entre em contato com a gente. 😊`)
}
