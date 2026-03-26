'use client'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { STATUS_LABELS, type OrderStatus } from '@/types/orders'

interface Props { busca: string; status: string; onBusca: (v: string) => void; onStatus: (v: string) => void }

export function OrderFilters({ busca, status, onBusca, onStatus }: Props) {
  return (
    <div className="flex gap-3 mb-4">
      <Input placeholder="Buscar por nome ou telefone..." value={busca}
        onChange={(e) => onBusca(e.target.value)} className="max-w-xs h-8 text-sm" />
      <Select value={status} onValueChange={(v) => onStatus(v ?? 'todos')}>
        <SelectTrigger className="w-48 h-8 text-sm"><SelectValue placeholder="Todos os status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos os status</SelectItem>
          {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((s) => (
            <SelectItem key={s} value={s} className="text-sm">{STATUS_LABELS[s]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
