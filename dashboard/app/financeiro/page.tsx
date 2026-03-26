import { FinanceiroCards } from '@/components/financeiro/FinanceiroCards'

export default function FinanceiroPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <h1 className="text-xl font-bold text-gray-800 mb-6">💰 Financeiro</h1>
      <FinanceiroCards />
    </div>
  )
}
