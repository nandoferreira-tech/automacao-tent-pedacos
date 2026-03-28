import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get('phone')
  const after = request.nextUrl.searchParams.get('after') // ISO date cursor

  if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 })

  // Marca mensagens deste contato como lidas
  await prisma.chatMessage.updateMany({
    where: { phone, direction: 'in', read: false },
    data: { read: true },
  })

  const messages = await prisma.chatMessage.findMany({
    where: {
      phone,
      ...(after ? { createdAt: { gt: new Date(after) } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
  })

  return NextResponse.json(messages)
}
