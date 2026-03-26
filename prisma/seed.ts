import { PrismaClient } from '../src/generated/prisma/index.js'

const db = new PrismaClient()

async function main() {
  // Limpa produtos existentes antes de recriar
  await db.product.deleteMany()

  // ------------------------------------------------------------------
  // BOLOS ARTESANAIS — TRADICIONAIS (R$ 25,00 cada)
  // ------------------------------------------------------------------
  const tradicionais = [
    'Cenoura',
    'Laranja',
    'Banana',
    'Maçã',
    'Limão',
    'Fubá',
    'Milho',
    'Formigueiro',
    'Chocolate',
    'Maracujá',
  ]

  for (const name of tradicionais) {
    await db.product.create({
      data: {
        category: 'bolos-artesanais',
        subcategory: 'tradicional',
        name,
        price: 25.00,
      },
    })
  }

  // ------------------------------------------------------------------
  // BOLOS ARTESANAIS — COBERTURAS (+ R$ 8,75, sempre opcional)
  // ------------------------------------------------------------------
  const coberturas = [
    'Chocolate',
    'Brigadeiro de paçoca',
    'Casquinha de limão/Laranja',
    'Brigadeiro branco/preto',
    'Geléia de goiaba',
    'Beijinho',
  ]

  for (const name of coberturas) {
    await db.product.create({
      data: {
        category: 'bolos-artesanais',
        subcategory: 'cobertura',
        name,
        price: 8.75,
        isAddon: true,
      },
    })
  }

  // ------------------------------------------------------------------
  // BOLOS ARTESANAIS — ESPECIAIS (preço fixo por produto)
  // ------------------------------------------------------------------
  const especiais: Array<{ name: string; price: number }> = [
    { name: 'Cenoura com gotas de chocolate', price: 31.00 },
    { name: 'Fubá com pedaços de goiabada',   price: 31.00 },
    { name: 'Iogurte com frutas vermelhas',    price: 43.00 },
    { name: 'Frutas Cristalizadas',            price: 31.00 },
    { name: 'Paçoca',                          price: 31.00 },
    { name: 'Banana com aveia',                price: 43.00 },
    { name: 'Chocolate com paçoca',            price: 31.00 },
    { name: 'Bolo de leite em pó',             price: 50.00 },
    { name: 'Bolo de cenoura com brigadeiro',  price: 43.00 },
    { name: 'Bolo de banana com doce de leite', price: 33.00 },
  ]

  for (const item of especiais) {
    await db.product.create({
      data: {
        category: 'bolos-artesanais',
        subcategory: 'especial',
        name: item.name,
        price: item.price,
      },
    })
  }

  // ------------------------------------------------------------------
  // BOLOS NO POTE (R$ 15,00 cada)
  // ------------------------------------------------------------------
  const bolosNoPote = [
    'Brigadeiro',
    'Cenoura com cobertura de chocolate',
    'Red Velvet',
    'Floresta Negra',
  ]

  for (const name of bolosNoPote) {
    await db.product.create({
      data: {
        category: 'bolos-no-pote',
        name,
        price: 15.00,
      },
    })
  }

  const total = await db.product.count()
  console.log(`✓ Seed concluído — ${total} produtos cadastrados.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
