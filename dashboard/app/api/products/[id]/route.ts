import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  const product = await prisma.product.update({
    where: { id },
    data: {
      ...(body.name        !== undefined && { name: body.name }),
      ...(body.category    !== undefined && { category: body.category }),
      ...(body.subcategory !== undefined && { subcategory: body.subcategory }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.price       !== undefined && { price: Number(body.price) }),
      ...(body.isAddon     !== undefined && { isAddon: body.isAddon }),
      ...(body.available   !== undefined && { available: body.available }),
    },
  })
  return NextResponse.json(product)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.product.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
