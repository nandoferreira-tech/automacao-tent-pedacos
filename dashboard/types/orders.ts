export type OrderStatus =
  | 'aguardando_pagamento'
  | 'pago'
  | 'em_producao'
  | 'pronto'
  | 'saiu_entrega'
  | 'entregue'
  | 'cancelado'

export const STATUS_LABELS: Record<OrderStatus, string> = {
  aguardando_pagamento: 'Aguardando pagamento',
  pago: 'Pago',
  em_producao: 'Em produção',
  pronto: 'Pronto',
  saiu_entrega: 'Saiu p/ entrega',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
}

export const STATUS_CORES: Record<OrderStatus, string> = {
  aguardando_pagamento: 'bg-yellow-100 text-yellow-800',
  pago: 'bg-blue-100 text-blue-800',
  em_producao: 'bg-purple-100 text-purple-800',
  pronto: 'bg-green-100 text-green-800',
  saiu_entrega: 'bg-teal-100 text-teal-800',
  entregue: 'bg-gray-100 text-gray-600',
  cancelado: 'bg-red-100 text-red-800',
}

export interface OrderItem {
  id: string
  quantity: number
  unitPrice: number
  product: { name: string }
}

export interface Order {
  id: string
  orderNumber: number
  customerName: string
  customerPhone: string
  deliveryType: string
  address: string | null
  status: OrderStatus
  paymentMethod: string
  comprovanteStatus: string | null
  total: number
  createdAt: string
  items: OrderItem[]
}
