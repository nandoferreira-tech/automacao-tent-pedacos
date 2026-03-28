import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// SSE — faz polling a cada 2s e emite novas mensagens para o cliente
export async function GET(request: NextRequest) {
  const after = request.nextUrl.searchParams.get('after')
  let cursor = after ? new Date(after) : new Date(Date.now() - 60_000)

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          // cliente desconectou
        }
      }

      // Envia keep-alive imediato
      send({ type: 'connected' })

      const poll = setInterval(async () => {
        try {
          const msgs = await prisma.chatMessage.findMany({
            where: { createdAt: { gt: cursor } },
            orderBy: { createdAt: 'asc' },
            take: 50,
          })
          if (msgs.length > 0) {
            cursor = msgs[msgs.length - 1]!.createdAt
            send({ type: 'messages', data: msgs })
          }
        } catch {
          // ignora erros de DB temporários
        }
      }, 2000)

      request.signal.addEventListener('abort', () => {
        clearInterval(poll)
        try { controller.close() } catch { /* já fechado */ }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  })
}
