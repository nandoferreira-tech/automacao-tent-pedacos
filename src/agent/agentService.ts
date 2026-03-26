import { GoogleGenAI } from '@google/genai'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { agentTools } from './tools.js'
import { validateDeliveryAddress } from '../tools/addressService.js'
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
  orderCreated?: { orderId: string; orderNumber: number; total: number; paymentMethod: string }
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
    config: {
      tools: agentTools,
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
      const paymentMethod      = String(args['paymentMethod'] ?? '')
      const deliveryType       = String(args['deliveryType'] ?? 'retirada')
      const address            = args['address'] ? String(args['address']) : null
      const name               = String(args['customerName'] ?? customerName)
      const coberturaEscolhida = args['coberturaEscolhida'] ? String(args['coberturaEscolhida']) : null
      const items = (args['items'] ?? []) as Array<{
        productName: string
        quantity: number
        unitPrice: number
      }>

      // Guard: se há Bolo Artesanal Tradicional (R$25) sem cobertura definida, recusa a criação
      const temTradicional = items.some((i) => i.unitPrice === 25)
      if (temTradicional && !coberturaEscolhida) {
        return { text: 'Preciso confirmar a cobertura antes de registrar o pedido. Por favor, pergunte ao cliente sobre a cobertura.' }
      }

      // Append cobertura como item se o cliente escolheu uma
      if (coberturaEscolhida && coberturaEscolhida !== 'sem cobertura' && coberturaEscolhida !== 'nao_aplicavel') {
        items.push({ productName: `Cobertura ${coberturaEscolhida}`, quantity: 1, unitPrice: 8.75 })
      }

      // Recalcula total a partir dos itens para garantir consistência
      const finalTotal = items.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0)

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

      // Cria o pedido — aguardando aprovação da boleria
      const order = await db.order.create({
        data: {
          customerPhone,
          customerName: name,
          deliveryType,
          address,
          paymentMethod,
          total: finalTotal,
          orderNumber,
          deliveryTime,
          status: 'aguardando_aprovacao',
          items: { create: resolvedItems },
        },
      })

      const orderId = String(orderNumber)

      return {
        text: [
          `🎂 Pedido *#${orderId}* recebido!`,
          '',
          `💵 Total: R$ ${finalTotal.toFixed(2).replace('.', ',')}`,
          '',
          'Estamos confirmando sua disponibilidade com a equipe. Em instantes você receberá a confirmação! 😊',
        ].join('\n'),
        orderCreated: { orderId: String(order.id), orderNumber, total: finalTotal, paymentMethod },
      }
    }

    case 'validarEnderecoEntrega': {
      const address = String(args['address'] ?? '')
      const result = await validateDeliveryAddress(address)

      if (result.error === 'Endereço não encontrado') {
        return {
          text: 'Hmm, não consegui localizar esse endereço no mapa. 🗺️\n\nPode conferir se está correto? Me passa a rua, número e bairro novamente. 😊',
        }
      }

      if (!result.valid) {
        return {
          text: [
            `Que pena! 😔 Infelizmente o endereço *${result.formattedAddress}* está fora da nossa área de entrega (${result.distanceKm} km da loja).`,
            '',
            'Mas não precisa ficar sem seu bolinho! Você pode retirar na loja:',
            '📍 *Rua Padre Carvalho, 388*',
            'https://maps.google.com/?q=Rua+Padre+Carvalho,+388,+São+Paulo',
            '',
            'Deseja fazer a retirada? 😊',
          ].join('\n'),
        }
      }

      return {
        text: `✅ Ótimo! Entregamos no endereço *${result.formattedAddress}* (${result.distanceKm} km da loja). Pode confirmar? 😊`,
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
