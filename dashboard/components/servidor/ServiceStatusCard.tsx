'use client'
import { useState } from 'react'
import { CheckCircle2, XCircle, HelpCircle, RefreshCw } from 'lucide-react'
import type { ServiceStatus } from '@/app/api/servidor/status/route'

interface Props {
  service: ServiceStatus
  onRestart: (id: string) => Promise<void>
}

export function ServiceStatusCard({ service, onRestart }: Props) {
  const [restarting, setRestarting] = useState(false)

  async function handleRestart() {
    setRestarting(true)
    try {
      await onRestart(service.id)
    } finally {
      setTimeout(() => setRestarting(false), 3000)
    }
  }

  const envLabel: Record<string, string> = {
    prod: 'Produção',
    homolog: 'Homologação',
    infra: 'Infraestrutura',
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0 hover:bg-gray-50 transition-colors">
      {/* Status icon */}
      <div className="w-8 flex justify-center shrink-0">
        {service.status === 'running' ? (
          <CheckCircle2 size={20} className="text-green-500" />
        ) : service.status === 'stopped' ? (
          <XCircle size={20} className="text-red-500" />
        ) : (
          <HelpCircle size={20} className="text-yellow-500" />
        )}
      </div>

      {/* Name + description */}
      <div className="flex-1 min-w-0 px-3">
        <p className="text-sm font-semibold text-gray-800 truncate">{service.name}</p>
        <p className="text-xs text-muted-foreground truncate">{service.description}</p>
      </div>

      {/* Env badge */}
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full mr-3 shrink-0 ${
        service.env === 'prod' ? 'bg-green-100 text-green-700' :
        service.env === 'homolog' ? 'bg-yellow-100 text-yellow-700' :
        'bg-gray-100 text-gray-600'
      }`}>
        {envLabel[service.env] ?? service.env}
      </span>

      {/* Action */}
      <div className="w-24 flex justify-end shrink-0">
        {service.canRestart ? (
          <button
            onClick={handleRestart}
            disabled={restarting}
            title="Reiniciar serviço"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              service.status === 'running'
                ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                : 'bg-red-100 text-red-700 hover:bg-red-200'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <RefreshCw size={12} className={restarting ? 'animate-spin' : ''} />
            {restarting ? 'Aguarde...' : service.status === 'running' ? 'Reiniciar' : 'Iniciar'}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground italic">Automático</span>
        )}
      </div>
    </div>
  )
}
