import { sseManager } from '@/lib/sse'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      sseManager.add(controller as ReadableStreamDefaultController<Uint8Array>)
      const ping = setInterval(() => {
        try { controller.enqueue(new TextEncoder().encode(': ping\n\n')) }
        catch { clearInterval(ping) }
      }, 30000)
    },
    cancel(controller) {
      sseManager.remove(controller as ReadableStreamDefaultController<Uint8Array>)
    },
  })
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
