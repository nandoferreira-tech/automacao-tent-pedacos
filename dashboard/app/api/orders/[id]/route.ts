import { prisma } from '@/lib/prisma'
import { sseManager } from '@/lib/sse'
import { notificarCliente } from '@/lib/notificacoes'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { status } = await req.json() as { status: string }
  const order = await prisma.order.update({
    where: { id },
    data: { status },
    include: { items: { include: { product: true } } },
  })
  sseManager.broadcast('status_atualizado', order)
  await notificarCliente(order.customerPhone, order.customerName, status)
  return NextResponse.json(order)
}
