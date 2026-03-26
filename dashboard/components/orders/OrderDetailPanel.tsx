'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { MapPin, Clock, Phone, ShoppingBag, X } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { STATUS_LABELS, type Order, type OrderStatus } from '@/types/orders'

const PAYMENT_LABELS: Record<string, string> = {
  pix:               'Pix',
  cartao_entrega:    'Cartão na entrega',
  dinheiro_entrega:  'Dinheiro na entrega',
  cartao_retirada:   'Cartão na retirada',
  dinheiro_retirada: 'Dinheiro na retirada',
}

const NEXT_STATUS: Partial<Record<OrderStatus, { label: string; status: OrderStatus; color: string }>> = {
  aguardando_pagamento: { label: 'Confirmar pagamento',   status: 'pago',         color: 'bg-blue-600 hover:bg-blue-700' },
  pago:                 { label: 'Iniciar produção',       status: 'em_producao',  color: 'bg-purple-600 hover:bg-purple-700' },
  em_producao:          { label: 'Avisar pedido pronto',   status: 'pronto',       color: 'bg-green-600 hover:bg-green-700' },
  pronto:               { label: 'Saiu para entrega',      status: 'saiu_entrega', color: 'bg-teal-600 hover:bg-teal-700' },
  saiu_entrega:         { label: 'Confirmar entrega',      status: 'entregue',     color: 'bg-gray-700 hover:bg-gray-800' },
}

interface Props {
  order: Order | null
  onClose: () => void
}

export function OrderDetailPanel({ order, onClose }: Props) {
  const qc = useQueryClient()

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`/api/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelado' }),
      }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); onClose() },
  })

  if (!order) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center text-muted-foreground">
          <ShoppingBag size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Selecione um pedido para ver os detalhes</p>
        </div>
      </div>
    )
  }

  const next = NEXT_STATUS[order.status as OrderStatus]

  return (
    <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-border px-6 py-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="bg-gray-900 text-white font-bold text-sm px-2.5 py-0.5 rounded">
                {order.orderNumber}
              </span>
              <h2 className="font-bold text-lg text-gray-900">{order.customerName}</h2>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Clock size={13} />
                {format(new Date(order.createdAt), "HH:mm", { locale: ptBR })}
              </span>
              {order.customerPhone && (
                <span className="flex items-center gap-1">
                  <Phone size={13} />
                  {order.customerPhone}
                </span>
              )}
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                {STATUS_LABELS[order.status as OrderStatus]}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        {/* Endereço / Retirada */}
        <div className="bg-white rounded-xl border border-border p-4">
          <div className="flex items-start gap-3">
            <MapPin size={16} className="text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-900">
                {order.deliveryType === 'retirada' ? 'Retirada na loja' : 'Entrega'}
              </p>
              {order.address && (
                <p className="text-sm text-muted-foreground mt-0.5">{order.address}</p>
              )}
              {order.deliveryType === 'retirada' && (
                <p className="text-sm text-muted-foreground mt-0.5">Rua Padre Carvalho, 388</p>
              )}
            </div>
          </div>
        </div>

        {/* Itens */}
        <div className="bg-white rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <ShoppingBag size={14} />
            Itens no pedido
          </h3>
          <div className="space-y-2">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="bg-gray-900 text-white text-xs font-bold w-5 h-5 rounded flex items-center justify-center">
                    {item.quantity}
                  </span>
                  <span className="text-sm text-gray-700">{item.product.name}</span>
                </div>
                <span className="text-sm font-medium text-gray-900">
                  R$ {(item.quantity * item.unitPrice).toFixed(2).replace('.', ',')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Totais */}
        <div className="bg-white rounded-xl border border-border p-4 space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Subtotal</span>
            <span>R$ {order.total.toFixed(2).replace('.', ',')}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-600">
            <span>Pagamento</span>
            <span>{PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}</span>
          </div>
          <div className="flex justify-between text-sm font-bold text-gray-900 pt-2 border-t border-border">
            <span>Total</span>
            <span>R$ {order.total.toFixed(2).replace('.', ',')}</span>
          </div>
        </div>
      </div>

      {/* Footer com botões */}
      <div className="bg-white border-t border-border px-6 py-4 flex gap-3">
        <button
          onClick={() => { if (confirm('Cancelar este pedido?')) cancelMutation.mutate(order.id) }}
          disabled={cancelMutation.isPending}
          className="flex-1 border border-primary text-primary rounded-lg py-2.5 text-sm font-semibold hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          Cancelar pedido
        </button>
        {next && (
          <button
            onClick={() => statusMutation.mutate({ id: order.id, status: next.status })}
            disabled={statusMutation.isPending}
            className={`flex-1 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${next.color}`}
          >
            {statusMutation.isPending ? 'Salvando…' : next.label}
          </button>
        )}
      </div>
    </div>
  )
}
