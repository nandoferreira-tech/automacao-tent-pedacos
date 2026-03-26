'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { OrderListPanel } from '@/components/orders/OrderListPanel'
import { OrderDetailPanel } from '@/components/orders/OrderDetailPanel'
import type { Order } from '@/types/orders'

export default function PedidosPage() {
  const [selected, setSelected] = useState<Order | null>(null)

  const { data: orders = [] } = useQuery<Order[]>({
    queryKey: ['orders'],
    queryFn: () => fetch('/api/orders').then((r) => r.json()),
    refetchInterval: 15000,
  })

  // Atualiza o pedido selecionado quando a lista recarregar
  const selectedOrder = selected
    ? (orders.find((o) => o.id === selected.id) ?? selected)
    : null

  return (
    <div className="flex h-screen overflow-hidden -m-0">
      <OrderListPanel
        orders={orders}
        selectedId={selectedOrder?.id ?? null}
        onSelect={setSelected}
      />
      <OrderDetailPanel
        order={selectedOrder}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
