import { STATUS_LABELS, STATUS_CORES, type OrderStatus } from '@/types/orders'

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CORES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}
