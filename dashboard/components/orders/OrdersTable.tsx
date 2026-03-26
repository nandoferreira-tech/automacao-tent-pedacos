'use client'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Order, OrderStatus } from '@/types/orders'
import { StatusBadge } from './StatusBadge'
import { StatusDropdown } from './StatusDropdown'
import { ComprovanteActions } from './ComprovanteActions'

interface Props { historico?: boolean; busca: string; status: string }

export function OrdersTable({ historico = false, busca, status }: Props) {
  const params = new URLSearchParams()
  if (historico) params.set('historico', 'true')
  if (busca) params.set('busca', busca)
  if (status && status !== 'todos') params.set('status', status)

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ['orders', historico, busca, status],
    queryFn: () => fetch(`/api/orders?${params}`).then((r) => r.json()),
    refetchInterval: 30000,
  })

  if (isLoading) return <p className="text-sm text-gray-400 py-8 text-center">Carregando...</p>
  if (!orders.length) return <p className="text-sm text-gray-400 py-8 text-center">Nenhum pedido encontrado.</p>

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
          <tr>
            {['Nº','Itens','Valor','Cliente','Endereço','Hora','Status','Ações'].map((h) => (
              <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {orders.map((o) => (
            <tr key={o.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-mono text-gray-500">#{o.orderNumber}</td>
              <td className="px-4 py-3">
                {o.items.map((item) => (
                  <div key={item.id} className="text-xs">{item.quantity}x {item.product.name}</div>
                ))}
              </td>
              <td className="px-4 py-3 font-medium">R$ {o.total.toFixed(2).replace('.', ',')}</td>
              <td className="px-4 py-3">
                <div className="font-medium">{o.customerName}</div>
                <div className="text-xs text-gray-400">{o.customerPhone}</div>
              </td>
              <td className="px-4 py-3 text-xs text-gray-500 max-w-[180px]">
                {o.deliveryType === 'retirada' ? '🏪 Retirada' : o.address ?? '—'}
              </td>
              <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                {format(new Date(o.createdAt), 'dd/MM HH:mm', { locale: ptBR })}
              </td>
              <td className="px-4 py-3"><StatusBadge status={o.status as OrderStatus} /></td>
              <td className="px-4 py-3">
                {!historico && (
                  <div className="space-y-1">
                    <StatusDropdown orderId={o.id} currentStatus={o.status as OrderStatus} />
                    {o.comprovanteStatus === 'pendente' && <ComprovanteActions orderId={o.id} />}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
