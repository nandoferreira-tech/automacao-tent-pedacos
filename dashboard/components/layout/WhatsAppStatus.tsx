'use client'
import { useEffect, useState, useCallback } from 'react'
import QRCode from 'react-qr-code'

type WppStatus = 'starting' | 'qr' | 'connected' | 'disconnected'

function WhatsAppIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

export function WhatsAppStatus() {
  const [status, setStatus] = useState<WppStatus>('starting')
  const [qr, setQr] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/wpp-status')
      const data = await res.json() as { status: WppStatus; qr: string | null }
      setStatus(data.status)
      setQr(data.qr)
      if (data.status === 'qr') setOpen(true)
      if (data.status === 'connected') setOpen(false)
    } catch {
      setStatus('disconnected')
    }
  }, [])

  useEffect(() => {
    poll()
    const interval = setInterval(poll, 15_000)
    return () => clearInterval(interval)
  }, [poll])

  const isOnline = status === 'connected'

  return (
    <>
      {/* Botão fixo canto superior direito */}
      <button
        title={isOnline ? 'WhatsApp conectado' : 'WhatsApp desconectado — clique para reconectar'}
        onClick={() => { if (!isOnline) setOpen(true) }}
        className={`fixed top-3 right-3 z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-sm font-semibold shadow transition-all select-none
          ${isOnline
            ? 'bg-green-500 cursor-default'
            : 'bg-red-500 hover:bg-red-600 cursor-pointer animate-pulse'
          }`}
      >
        <WhatsAppIcon size={16} />
        {isOnline ? 'ON' : 'OFF'}
      </button>

      {/* Modal com QR code */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-5 w-full max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-red-600">
              <WhatsAppIcon size={24} />
              <span className="font-bold text-lg">Reconectar WhatsApp</span>
            </div>

            {qr ? (
              <>
                <p className="text-sm text-gray-500 text-center leading-relaxed">
                  Abra o WhatsApp no celular →<br />
                  <strong>Aparelhos conectados</strong> → <strong>Conectar aparelho</strong>
                </p>
                <div className="p-4 bg-white border-2 border-gray-100 rounded-xl shadow-inner">
                  <QRCode value={qr} size={220} />
                </div>
                <p className="text-xs text-gray-400">Atualiza automaticamente a cada 15s</p>
              </>
            ) : (
              <p className="text-sm text-gray-500 text-center">
                Aguardando o agente gerar o QR code…<br />
                <span className="text-xs text-gray-400">Isso pode levar alguns segundos.</span>
              </p>
            )}

            <button
              onClick={() => setOpen(false)}
              className="text-sm text-gray-400 hover:text-gray-600 underline mt-1"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </>
  )
}
