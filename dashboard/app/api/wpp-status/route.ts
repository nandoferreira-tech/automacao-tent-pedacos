import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type WppStatusResponse = { status: string; qr: string | null }

// ── Evolution API ─────────────────────────────────────────────────────────────
async function getEvolutionStatus(): Promise<WppStatusResponse> {
  const url      = process.env['EVOLUTION_API_URL']  ?? 'http://localhost:8080'
  const key      = process.env['EVOLUTION_API_KEY']  ?? 'tentacao2024'
  const instance = process.env['EVOLUTION_INSTANCE'] ?? 'agente-prod'
  const headers  = { apikey: key }

  // 1. Estado da conexão
  try {
    const stateRes = await fetch(`${url}/instance/connectionState/${instance}`, {
      headers, cache: 'no-store',
    })
    if (stateRes.ok) {
      const sd = await stateRes.json() as { instance?: { state?: string }; state?: string }
      const state = sd.instance?.state ?? sd.state ?? 'close'
      if (state === 'open') return { status: 'connected', qr: null }
    }
  } catch {
    // Evolution API offline
  }

  // 2. Desconectado — solicita QR code
  // v2.3.7: GET /instance/connect/{instance} retorna { code, base64, count }
  try {
    const connectRes = await fetch(`${url}/instance/connect/${instance}`, {
      headers, cache: 'no-store',
    })
    if (!connectRes.ok) return { status: 'disconnected', qr: null }

    const cd = await connectRes.json() as {
      code?: string
      base64?: string
      count?: number
      pairingCode?: string
    }

    // Tenta code (string raw para react-qr-code), depois base64 como fallback
    const qr = cd.code ?? null
    return { status: qr ? 'qr' : 'disconnected', qr }
  } catch {
    return { status: 'disconnected', qr: null }
  }
}

// ── whatsapp-web.js (fallback para WHATSAPP_PROVIDER=wwebjs) ─────────────────
async function getWwebjsStatus(): Promise<WppStatusResponse> {
  const agentUrl = process.env['AGENT_INTERNAL_URL'] ?? 'http://localhost:3001'
  const res = await fetch(`${agentUrl}/internal/wpp-status`, { cache: 'no-store' })
  return res.json() as Promise<WppStatusResponse>
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const useEvolution = process.env['WHATSAPP_PROVIDER'] === 'evolution'
    const data = useEvolution ? await getEvolutionStatus() : await getWwebjsStatus()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ status: 'disconnected', qr: null })
  }
}
