'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'

export function ComprovanteActions({ orderId }: { orderId: string }) {
  const queryClient = useQueryClient()
  const { mutate, isPending } = useMutation({
    mutationFn: async (acao: 'confirmar' | 'recusar') => {
      await fetch(`/api/orders/${orderId}/comprovante`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao }),
      })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  })
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50"
        onClick={() => mutate('confirmar')} disabled={isPending}>✅ Confirmar</Button>
      <Button size="sm" variant="outline" className="h-7 text-xs text-red-700 border-red-300 hover:bg-red-50"
        onClick={() => mutate('recusar')} disabled={isPending}>❌ Recusar</Button>
    </div>
  )
}
