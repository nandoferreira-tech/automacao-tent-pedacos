import { type Tool, Type } from '@google/genai'

/**
 * Ferramentas disponíveis para o agente Gemini.
 * Cada tool representa uma ação que o agente pode executar no sistema.
 */
export const agentTools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: 'criarPedido',
        description: 'Cria um pedido no sistema após confirmação do cliente.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            customerPhone:  { type: Type.STRING, description: 'Número do cliente' },
            customerName:   { type: Type.STRING, description: 'Nome do cliente' },
            items: {
              type: Type.ARRAY,
              description: 'Itens do pedido',
              items: {
                type: Type.OBJECT,
                properties: {
                  productName: { type: Type.STRING, description: 'Nome do produto' },
                  quantity:    { type: Type.NUMBER, description: 'Quantidade' },
                  unitPrice:   { type: Type.NUMBER, description: 'Preço unitário em reais' },
                },
                required: ['productName', 'quantity', 'unitPrice'],
              },
            },
            deliveryType:    { type: Type.STRING, description: '"retirada" ou "entrega"' },
            address:         { type: Type.STRING, description: 'Endereço de entrega (se deliveryType=entrega)' },
            paymentMethod:   { type: Type.STRING, description: '"pix" | "cartao_entrega" | "dinheiro_entrega"' },
            total:           { type: Type.NUMBER, description: 'Valor total do pedido em reais' },
          },
          required: ['customerPhone', 'customerName', 'items', 'deliveryType', 'paymentMethod', 'total'],
        },
      },
      {
        name: 'consultarStatus',
        description: 'Consulta o status de um pedido pelo número do cliente.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            customerPhone: { type: Type.STRING, description: 'Número do cliente' },
          },
          required: ['customerPhone'],
        },
      },
      {
        name: 'consultarFidelidade',
        description: 'Consulta os pontos de fidelidade do cliente.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            customerPhone: { type: Type.STRING, description: 'Número do cliente' },
          },
          required: ['customerPhone'],
        },
      },
      {
        name: 'iniciarCadastro',
        description: 'Inicia o fluxo de cadastro no programa de fidelidade.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            customerPhone: { type: Type.STRING, description: 'Número do cliente' },
          },
          required: ['customerPhone'],
        },
      },
      {
        name: 'transferirAtendente',
        description: 'Sinaliza que o cliente quer falar com um atendente humano.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            customerPhone: { type: Type.STRING, description: 'Número do cliente' },
            reason:        { type: Type.STRING, description: 'Motivo da transferência' },
          },
          required: ['customerPhone'],
        },
      },
    ],
  },
]
