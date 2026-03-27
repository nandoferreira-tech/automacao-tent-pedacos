'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Server } from 'lucide-react'
import { ServiceStatusCard } from '@/components/servidor/ServiceStatusCard'
import type { ServiceStatus } from '@/app/api/servidor/status/route'

export default function ServidorPage() {
  const qc = useQueryClient()
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [restartMsg, setRestartMsg] = useState<string | null>(null)

  const { data: services = [], isLoading, isFetching } = useQuery<ServiceStatus[]>({
    queryKey: ['servidor-status'],
    queryFn: () => fetch('/api/servidor/status').then(r => r.json()),
    refetchInterval: 15000,
  })

  function refresh() {
    setLastRefresh(new Date())
    void qc.invalidateQueries({ queryKey: ['servidor-status'] })
  }

  async function handleRestart(id: string) {
    setRestartMsg(null)
    const res = await fetch(`/api/servidor/${id}/restart`, { method: 'POST' })
    const data = await res.json() as { ok: boolean; error?: string }
    if (data.ok) {
      setRestartMsg(`✅ Serviço reiniciado. Aguarde alguns segundos...`)
      setTimeout(() => refresh(), 4000)
    } else {
      setRestartMsg(`❌ Erro ao reiniciar: ${data.error ?? 'desconhecido'}`)
    }
    setTimeout(() => setRestartMsg(null), 8000)
  }

  const groups: { label: string; env: string }[] = [
    { label: 'Produção', env: 'prod' },
    { label: 'Homologação', env: 'homolog' },
    { label: 'Infraestrutura', env: 'infra' },
  ]

  const running = services.filter(s => s.status === 'running').length
  const total = services.length

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Server size={22} className="text-primary" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Status do Servidor</h1>
            <p className="text-xs text-muted-foreground">
              {isLoading ? 'Carregando...' : `${running} de ${total} serviços ativos`}
              {' · '}
              Atualizado às {lastRefresh.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          </div>
        </div>
        <button
          onClick={refresh}
          disabled={isFetching}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Restart message */}
      {restartMsg && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-blue-50 text-blue-800 text-sm border border-blue-200">
          {restartMsg}
        </div>
      )}

      {/* Service groups */}
      {isLoading ? (
        <div className="rounded-xl border border-border bg-white divide-y divide-border">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse">
              <div className="w-5 h-5 rounded-full bg-gray-200 shrink-0" />
              <div className="flex-1">
                <div className="h-3.5 bg-gray-200 rounded w-32 mb-1.5" />
                <div className="h-3 bg-gray-100 rounded w-48" />
              </div>
              <div className="h-7 bg-gray-100 rounded w-20" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(({ label, env }) => {
            const group = services.filter(s => s.env === env)
            if (group.length === 0) return null
            const groupRunning = group.filter(s => s.status === 'running').length
            return (
              <div key={env} className="rounded-xl border border-border bg-white overflow-hidden shadow-sm">
                {/* Group header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-border">
                  <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">{label}</p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    groupRunning === group.length ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {groupRunning}/{group.length} ativos
                  </span>
                </div>
                {/* Services */}
                <div>
                  {group.map(service => (
                    <ServiceStatusCard key={service.id} service={service} onRestart={handleRestart} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
