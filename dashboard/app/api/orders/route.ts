import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const historico = searchParams.get('historico') === 'true'
  const status = searchParams.get('status')
  const busca = searchParams.get('busca') ?? ''
  const de = searchParams.get('de')
  const ate = searchParams.get('ate')

  const statusFiltro = historico
    ? { in: ['entregue', 'cancelado'] }
    : { notIn: ['entregue', 'cancelado'] }

  const orders = await prisma.order.findMany({
    where: {
      status: status ? { equals: status } : statusFiltro,
      createdAt: {
        gte: de ? new Date(de) : undefined,
        lte: ate ? new Date(ate) : undefined,
      },
      OR: busca ? [
        { customerName: { contains: busca } },
        { customerPhone: { contains: busca } },
      ] : undefined,
    },
    include: { items: { include: { product: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(orders)
}
