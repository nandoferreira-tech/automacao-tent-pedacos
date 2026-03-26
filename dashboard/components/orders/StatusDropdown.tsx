'use client'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { STATUS_LABELS, type OrderStatus } from '@/types/orders'
import { useMutation, useQueryClient } from '@tanstack/react-query'

const STATUS_OPCOES: OrderStatus[] = ['aguardando_pagamento','pago','em_producao','pronto','saiu_entrega','entregue','cancelado']

export function StatusDropdown({ orderId, currentStatus }: { orderId: string; currentStatus: OrderStatus }) {
  const queryClient = useQueryClient()
  const { mutate } = useMutation({
    mutationFn: async (status: string) => {
      await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  })
  return (
    <Select value={currentStatus} onValueChange={(v) => { if (v) mutate(v) }}>
      <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        {STATUS_OPCOES.map((s) => (
          <SelectItem key={s} value={s} className="text-xs">{STATUS_LABELS[s]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
