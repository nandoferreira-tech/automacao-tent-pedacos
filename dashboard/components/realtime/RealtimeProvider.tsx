'use client'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const audioCtxRef = useRef<AudioContext | null>(null)
  const [audioEnabled, setAudioEnabled] = useState(false)

  function enableAudio() {
    audioCtxRef.current = new AudioContext()
    setAudioEnabled(true)
  }

  function playBeep() {
    const ctx = audioCtxRef.current
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.4)
  }

  useEffect(() => {
    const es = new EventSource('/api/events')
    es.addEventListener('status_atualizado', () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['financeiro'] })
    })
    es.addEventListener('novo_pedido', () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['financeiro'] })
      playBeep()
    })
    return () => es.close()
  }, [queryClient])

  return (
    <>
      {!audioEnabled && (
        <div className="fixed bottom-4 right-4 z-50">
          <button onClick={enableAudio}
            className="bg-pink-600 text-white px-4 py-2 rounded-full text-sm shadow-lg hover:bg-pink-700">
            🔔 Ativar alertas sonoros
          </button>
        </div>
      )}
      {children}
    </>
  )
}
