import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const products = await prisma.product.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] })
  return NextResponse.json(products)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { category, subcategory, name, description, price, isAddon } = body

  if (!category || !name || price == null) {
    return NextResponse.json({ error: 'category, name e price são obrigatórios' }, { status: 400 })
  }

  const product = await prisma.product.create({
    data: {
      category,
      subcategory: subcategory ?? null,
      name,
      description: description ?? null,
      price: Number(price),
      isAddon: isAddon ?? false,
      available: true,
    },
  })
  return NextResponse.json(product, { status: 201 })
}
