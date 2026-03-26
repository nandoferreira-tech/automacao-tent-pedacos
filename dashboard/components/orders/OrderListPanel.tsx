'use client'
import { useState } from 'react'
import { Search, SlidersHorizontal, ChevronDown } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { STATUS_LABELS, type Order, type OrderStatus } from '@/types/orders'

const ACTIVE_STATUSES: OrderStatus[] = [
  'aguardando_pagamento',
  'pago',
  'em_producao',
  'pronto',
  'saiu_entrega',
]

const STATUS_COLOR_DOT: Record<OrderStatus, string> = {
  aguardando_pagamento: 'bg-yellow-400',
  pago:                 'bg-blue-400',
  em_producao:          'bg-purple-400',
  pronto:               'bg-green-400',
  saiu_entrega:         'bg-teal-400',
  entregue:             'bg-gray-300',
  cancelado:            'bg-red-400',
}

interface Props {
  orders: Order[]
  selectedId: string | null
  onSelect: (order: Order) => void
}

export function OrderListPanel({ orders, selectedId, onSelect }: Props) {
  const [busca, setBusca] = useState('')
  const [openGroups, setOpenGroups] = useState<Set<OrderStatus>>(new Set(ACTIVE_STATUSES))
  const [tab, setTab] = useState<'agora' | 'agendados'>('agora')

  function toggleGroup(status: OrderStatus) {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      next.has(status) ? next.delete(status) : next.add(status)
      return next
    })
  }

  const filtered = orders.filter((o) =>
    !busca ||
    o.customerName.toLowerCase().includes(busca.toLowerCase()) ||
    String(o.orderNumber).includes(busca),
  )

  const grouped = ACTIVE_STATUSES.map((status) => ({
    status,
    orders: filtered.filter((o) => o.status === status),
  })).filter((g) => g.orders.length > 0)

  return (
    <div className="flex flex-col h-full bg-white border-r border-border w-[360px] shrink-0">
      {/* Tabs */}
      <div className="flex border-b border-border">
        {(['agora', 'agendados'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-medium transition-colors capitalize ${
              tab === t
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-gray-700'
            }`}
          >
            {t === 'agora' ? 'Agora' : 'Agendados'}
          </button>
        ))}
      </div>

      {/* Aceite automático */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-xs font-medium text-gray-700">Aceite automático de pedidos</span>
        <div className="w-9 h-5 rounded-full bg-gray-200 relative cursor-not-allowed opacity-50">
          <div className="w-4 h-4 rounded-full bg-white shadow absolute top-0.5 left-0.5 transition-transform" />
        </div>
      </div>

      {/* Busca + Filtros */}
      <div className="flex gap-2 px-3 py-3 border-b border-border">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar pedido"
            className="w-full pl-7 pr-3 py-1.5 text-sm border border-border rounded-lg bg-gray-50"
          />
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          <SlidersHorizontal size={13} />
          Filtros
        </button>
      </div>

      {/* Groups */}
      <div className="flex-1 overflow-y-auto">
        {grouped.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-3xl mb-2">📦</p>
            <p className="text-sm">Nenhum pedido ativo.</p>
          </div>
        )}
        {grouped.map(({ status, orders: groupOrders }) => (
          <div key={status} className="border-b border-border last:border-0">
            {/* Group header */}
            <button
              onClick={() => toggleGroup(status)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-800">
                  {STATUS_LABELS[status]}
                </span>
                <span className="bg-gray-100 text-gray-600 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                  {groupOrders.length}
                </span>
              </div>
              <ChevronDown
                size={16}
                className={`text-gray-400 transition-transform ${openGroups.has(status) ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Order cards */}
            {openGroups.has(status) && groupOrders.map((order) => (
              <button
                key={order.id}
                onClick={() => onSelect(order)}
                className={`w-full text-left px-4 py-3 border-t border-border transition-colors ${
                  selectedId === order.id ? 'bg-red-50 border-l-2 border-l-primary' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLOR_DOT[status]}`} />
                    <span className="font-bold text-sm text-gray-900">#{order.orderNumber}</span>
                    <span className="text-sm text-gray-700 truncate max-w-[130px]">{order.customerName}</span>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(order.createdAt), 'HH:mm', { locale: ptBR })}
                  </span>
                </div>
                <div className="flex items-center justify-between pl-4">
                  <span className="text-xs text-muted-foreground">
                    {order.items.map((i) => `${i.quantity}x ${i.product.name}`).join(', ')}
                  </span>
                  <span className="text-xs font-semibold text-gray-800">
                    R$ {order.total.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
