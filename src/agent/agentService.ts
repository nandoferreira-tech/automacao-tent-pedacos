import { GoogleGenAI } from '@google/genai'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { agentTools } from './tools.js'
import { formatPixInstructions } from '../tools/pixService.js'
import { db } from '../lib/db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const ai = new GoogleGenAI({ apiKey: process.env['GOOGLE_API_KEY'] ?? '' })

const SYSTEM_PROMPT = readFileSync(
  join(__dirname, '../prompts/system.md'),
  'utf-8',
)

const CUTOFF_HOUR = Number(process.env['CUTOFF_HOUR'] ?? 11)

export interface AgentResponse {
  text: string
  transferToAttendant?: boolean
  orderCreated?: { orderId: string; total: number; paymentMethod: string }
}

/**
 * Processa uma mensagem do cliente e retorna a resposta do agente.
 */
export async function processMessage(
  customerPhone: string,
  customerName: string,
  incomingText: string,
  conversationHistory: Array<{ role: 'user' | 'model'; text: string }>,
): Promise<AgentResponse> {

  const contents = [
    ...conversationHistory.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    })),
    {
      role: 'user' as const,
      parts: [{ text: incomingText }],
    },
  ]

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents,
    tools: agentTools,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.7,
      maxOutputTokens: 512,
    },
  })

  const candidate = response.candidates?.[0]
  if (!candidate) return { text: 'Desculpe, tive um problema. Tente novamente! 😊' }

  const functionCall = candidate.content?.parts?.find((p) => p.functionCall)?.functionCall

  if (functionCall) {
    return await handleToolCall(
      functionCall.name ?? '',
      (functionCall.args ?? {}) as Record<string, unknown>,
      customerPhone,
      customerName,
    )
  }

  const text = candidate.content?.parts?.find((p) => p.text)?.text ?? ''
  return { text }
}

/**
 * Executa a ferramenta chamada pelo agente e retorna a resposta ao cliente.
 */
async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>,
  customerPhone: string,
  customerName: string,
): Promise<AgentResponse> {

  switch (toolName) {

    case 'criarPedido': {
      const total         = Number(args['total'] ?? 0)
      const paymentMethod = String(args['paymentMethod'] ?? '')
      const deliveryType  = String(args['deliveryType'] ?? 'retirada')
      const address       = args['address'] ? String(args['address']) : null
      const name          = String(args['customerName'] ?? customerName)
      const items = (args['items'] ?? []) as Array<{
        productName: string
        quantity: number
        unitPrice: number
      }>

      // Calcula horário de entrega
      const now = new Date()
      let deliveryTime: Date
      if (now.getHours() < CUTOFF_HOUR) {
        deliveryTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0, 0)
      } else {
        const amanha = new Date(now)
        amanha.setDate(amanha.getDate() + 1)
        deliveryTime = new Date(amanha.getFullYear(), amanha.getMonth(), amanha.getDate(), 9, 0, 0)
      }

      // Número sequencial do pedido
      const lastOrder = await db.order.findFirst({
        orderBy: { orderNumber: 'desc' },
        where: { orderNumber: { not: null } },
      })
      const orderNumber = (lastOrder?.orderNumber ?? 0) + 1

      // Garante que o cliente existe
      await db.customer.upsert({
        where: { phone: customerPhone },
        create: { phone: customerPhone, name },
        update: { name },
      })

      // Resolve productId para cada item
      const resolvedItems = await Promise.all(
        items.map(async (item) => {
          let product = await db.product.findFirst({
            where: { name: { contains: item.productName } },
          })
          if (!product) {
            product = await db.product.create({
              data: { name: item.productName, category: 'outros', price: item.unitPrice },
            })
          }
          return { productId: product.id, quantity: item.quantity, unitPrice: item.unitPrice }
        }),
      )

      // Cria o pedido
      const order = await db.order.create({
        data: {
          customerPhone,
          customerName: name,
          deliveryType,
          address,
          paymentMethod,
          total,
          orderNumber,
          deliveryTime,
          items: { create: resolvedItems },
        },
      })

      const orderId = String(orderNumber)

      if (paymentMethod === 'pix') {
        const pixMsg = formatPixInstructions(Math.round(total * 100), orderId)
        return {
          text: `✅ Pedido *#${orderId}* registrado!\n\n${pixMsg}\n\nMuito obrigada por comprar na *Tentação em Pedaços*! 🎂`,
          orderCreated: { orderId: String(order.id), total, paymentMethod },
        }
      }

      const prazo = now.getHours() < CUTOFF_HOUR ? 'hoje à tarde 🌤️' : 'amanhã pela manhã ☀️'
      return {
        text: [
          `✅ Pedido *#${orderId}* confirmado!`,
          '',
          `💵 Total: R$ ${total.toFixed(2).replace('.', ',')}`,
          `💳 Pagamento: ${paymentMethod.includes('cartao') ? 'Cartão' : 'Dinheiro'} ${deliveryType === 'entrega' ? 'na entrega' : 'na retirada'}`,
          `🕑 Previsão: ${prazo}`,
          '',
          'Muito obrigada por comprar na *Tentação em Pedaços*! Vai ser uma delícia! 🎂❤️',
        ].join('\n'),
        orderCreated: { orderId: String(order.id), total, paymentMethod },
      }
    }

    case 'consultarStatus': {
      return { text: 'Deixa eu verificar seu pedido... 🔍\n\n_Em breve essa função estará disponível!_' }
    }

    case 'consultarFidelidade': {
      return { text: 'Vou checar seus pontos! ⭐\n\n_Em breve essa função estará disponível!_' }
    }

    case 'iniciarCadastro': {
      return {
        text: '💜 Que ótimo que quer se cadastrar!\n\nPara participar do programa de fidelidade, preciso de algumas informações.\nPode me dizer seu *nome completo*?',
      }
    }

    case 'transferirAtendente': {
      return {
        text: 'Claro! Vou chamar um atendente para você. 😊\n\nUm momento, por favor...',
        transferToAttendant: true,
      }
    }

    default:
      return { text: 'Desculpe, não consegui processar. Tente novamente! 😊' }
  }
}
