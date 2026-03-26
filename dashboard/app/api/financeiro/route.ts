import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function rangeInicio(dias: number) {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  d.setHours(0, 0, 0, 0)
  return d
}

async function totais(gte: Date) {
  const result = await prisma.order.aggregate({
    where: { createdAt: { gte }, status: { notIn: ['cancelado'] } },
    _count: { id: true },
    _sum: { total: true },
  })
  return { pedidos: result._count.id, faturamento: result._sum.total ?? 0 }
}

export async function GET() {
  const [dia, semana, mes] = await Promise.all([
    totais(rangeInicio(0)),
    totais(rangeInicio(7)),
    totais(rangeInicio(30)),
  ])
  return NextResponse.json({ dia, semana, mes })
}
