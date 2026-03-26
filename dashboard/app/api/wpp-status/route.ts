import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const agentUrl = process.env.AGENT_INTERNAL_URL ?? 'http://localhost:3001'
  try {
    const res = await fetch(`${agentUrl}/internal/wpp-status`, { cache: 'no-store' })
    const data = await res.json() as { status: string; qr: string | null }
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ status: 'disconnected', qr: null })
  }
}
