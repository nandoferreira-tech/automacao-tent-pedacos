'use client'
import { useState } from 'react'
import { OrderFilters } from '@/components/orders/OrderFilters'
import { OrdersTable } from '@/components/orders/OrdersTable'

export default function HistoricoPage() {
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('todos')
  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <h1 className="text-xl font-bold text-gray-800 mb-4">📦 Histórico de Pedidos</h1>
      <OrderFilters busca={busca} status={status} onBusca={setBusca} onStatus={setStatus} />
      <OrdersTable historico busca={busca} status={status} />
    </div>
  )
}
