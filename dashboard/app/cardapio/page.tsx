'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { ProductCard, type Product } from '@/components/cardapio/ProductCard'
import { ProductFormDialog } from '@/components/cardapio/ProductFormDialog'

const TABS = [
  { value: 'todos',           label: 'Todos' },
  { value: 'bolos-no-pote',   label: 'Bolos no Pote' },
  { value: 'bolos-artesanais', label: 'Artesanais' },
  { value: 'coberturas',       label: 'Coberturas' },
]

export default function CardapioPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('todos')
  const [busca, setBusca] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => fetch('/api/products').then((r) => r.json()),
  })

  const createMutation = useMutation({
    mutationFn: (data: Omit<Product, 'id'>) =>
      fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: Partial<Product> & { id: string }) =>
      fetch(`/api/products/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/products/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })

  const filtered = products.filter((p) => {
    const matchTab = tab === 'todos' || p.category === tab
    const matchBusca = !busca || p.name.toLowerCase().includes(busca.toLowerCase())
    return matchTab && matchBusca
  })

  async function handleSave(data: Omit<Product, 'id'>) {
    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, ...data })
    } else {
      await createMutation.mutateAsync(data)
    }
  }

  function handleEdit(p: Product) {
    setEditing(p)
    setDialogOpen(true)
  }

  function handleNew() {
    setEditing(null)
    setDialogOpen(true)
  }

  function handleDelete(id: string) {
    if (confirm('Excluir este produto?')) deleteMutation.mutate(id)
  }

  function handleToggleAvailable(id: string, available: boolean) {
    updateMutation.mutate({ id, available })
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cardápio</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{products.length} produtos cadastrados</p>
        </div>
        <button
          onClick={handleNew}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus size={16} />
          Novo produto
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        {/* Tabs categoria */}
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t.value ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground hover:text-gray-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Busca */}
        <div className="relative sm:ml-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto…"
            className="pl-8 pr-4 py-2 border border-border rounded-lg text-sm bg-card w-full sm:w-52"
          />
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground py-12 text-center">Carregando produtos…</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-4xl mb-3">🍰</p>
          <p className="text-sm">Nenhum produto encontrado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onToggleAvailable={handleToggleAvailable}
            />
          ))}
        </div>
      )}

      <ProductFormDialog
        open={dialogOpen}
        product={editing}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
      />
    </div>
  )
}
