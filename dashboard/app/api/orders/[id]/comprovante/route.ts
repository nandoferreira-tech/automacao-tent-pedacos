import { prisma } from '@/lib/prisma'
import { sseManager } from '@/lib/sse'
import { notificarCliente } from '@/lib/notificacoes'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { acao } = await req.json() as { acao: 'confirmar' | 'recusar' }
  const novoStatus = acao === 'confirmar' ? 'pago' : 'aguardando_pagamento'
  const order = await prisma.order.update({
    where: { id },
    data: { comprovanteStatus: acao === 'confirmar' ? 'confirmado' : 'recusado', status: novoStatus },
    include: { items: { include: { product: true } } },
  })
  sseManager.broadcast('status_atualizado', order)
  if (acao === 'confirmar') await notificarCliente(order.customerPhone, order.customerName, 'pago')
  return NextResponse.json(order)
}
