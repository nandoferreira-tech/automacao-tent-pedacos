import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  // Agrupa mensagens por telefone, retorna último contato e total de não lidas
  const contacts = await prisma.chatMessage.groupBy({
    by: ['phone'],
    _max: { createdAt: true },
    _count: { id: true },
    orderBy: { _max: { createdAt: 'desc' } },
    take: 50,
  })

  const result = await Promise.all(
    contacts.map(async (c) => {
      const last = await prisma.chatMessage.findFirst({
        where: { phone: c.phone },
        orderBy: { createdAt: 'desc' },
        select: { body: true, direction: true, name: true, createdAt: true },
      })
      const unread = await prisma.chatMessage.count({
        where: { phone: c.phone, direction: 'in', read: false },
      })
      return {
        phone: c.phone,
        name: last?.name || c.phone,
        lastMessage: last?.body ?? '',
        lastDirection: last?.direction ?? 'in',
        lastAt: last?.createdAt ?? new Date(),
        unread,
      }
    }),
  )

  return NextResponse.json(result)
}
