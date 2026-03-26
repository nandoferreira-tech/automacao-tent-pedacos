'use client'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Totais { pedidos: number; faturamento: number }
interface FinanceiroData { dia: Totais; semana: Totais; mes: Totais }

function CardFinanceiro({ titulo, dados }: { titulo: string; dados: Totais }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-500">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-pink-600">
          R$ {dados.faturamento.toFixed(2).replace('.', ',')}
        </div>
        <p className="text-xs text-gray-400 mt-1">{dados.pedidos} pedido{dados.pedidos !== 1 ? 's' : ''}</p>
      </CardContent>
    </Card>
  )
}

export function FinanceiroCards() {
  const { data, isLoading } = useQuery<FinanceiroData>({
    queryKey: ['financeiro'],
    queryFn: () => fetch('/api/financeiro').then((r) => r.json()),
    refetchInterval: 60000,
  })
  if (isLoading) return <p className="text-sm text-gray-400">Carregando...</p>
  if (!data) return null
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <CardFinanceiro titulo="Hoje" dados={data.dia} />
      <CardFinanceiro titulo="Últimos 7 dias" dados={data.semana} />
      <CardFinanceiro titulo="Últimos 30 dias" dados={data.mes} />
    </div>
  )
}
