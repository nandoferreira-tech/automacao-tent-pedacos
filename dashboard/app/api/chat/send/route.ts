import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const { phone, message } = await request.json() as { phone: string; message: string }

  if (!phone || !message) {
    return NextResponse.json({ error: 'phone e message são obrigatórios' }, { status: 400 })
  }

  const EVOLUTION_API_URL = process.env['EVOLUTION_API_URL'] ?? 'http://localhost:8080'
  const EVOLUTION_API_KEY = process.env['EVOLUTION_API_KEY'] ?? ''
  const EVOLUTION_INSTANCE = process.env['EVOLUTION_INSTANCE'] ?? 'agente'

  // Envia via Evolution API
  const res = await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
    body: JSON.stringify({ number: phone, text: message }),
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: `Evolution API: ${err}` }, { status: 502 })
  }

  // Salva mensagem enviada no histórico
  const saved = await prisma.chatMessage.create({
    data: { phone, name: '', direction: 'out', body: message, read: true },
  })

  return NextResponse.json(saved)
}
