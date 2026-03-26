'use client'
import { useState, useEffect } from 'react'
import type { Product } from './ProductCard'

const CATEGORIES = [
  { value: 'bolos-no-pote',   label: 'Bolos no Pote' },
  { value: 'bolos-artesanais', label: 'Bolos Artesanais' },
  { value: 'coberturas',       label: 'Coberturas' },
]

const SUBCATEGORIES: Record<string, string[]> = {
  'bolos-artesanais': ['tradicional', 'especial'],
}

interface Props {
  open: boolean
  product: Product | null   // null = criar novo
  onClose: () => void
  onSave: (data: Omit<Product, 'id'>) => Promise<void>
}

const empty = {
  category: 'bolos-no-pote',
  subcategory: '',
  name: '',
  description: '',
  price: '',
  isAddon: false,
  available: true,
}

export function ProductFormDialog({ open, product, onClose, onSave }: Props) {
  const [form, setForm] = useState({ ...empty })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (product) {
      setForm({
        category:    product.category,
        subcategory: product.subcategory ?? '',
        name:        product.name,
        description: product.description ?? '',
        price:       String(product.price),
        isAddon:     product.isAddon,
        available:   product.available,
      })
    } else {
      setForm({ ...empty })
    }
  }, [product, open])

  if (!open) return null

  const subcats = SUBCATEGORIES[form.category] ?? []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave({
        category:    form.category,
        subcategory: form.subcategory || null,
        name:        form.name,
        description: form.description || null,
        price:       Number(form.price),
        isAddon:     form.isAddon,
        available:   form.available,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border">
          <h2 className="font-bold text-gray-900">{product ? 'Editar produto' : 'Novo produto'}</h2>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Categoria */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Categoria</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value, subcategory: '' })}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Subcategoria (condicional) */}
          {subcats.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Subcategoria</label>
              <select
                value={form.subcategory}
                onChange={(e) => setForm({ ...form, subcategory: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
              >
                <option value="">— Nenhuma —</option>
                {subcats.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          {/* Nome */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Nome</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Bolo de Cenoura"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
            />
          </div>

          {/* Descrição */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Descrição (opcional)</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Ex: Com cobertura de brigadeiro"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
            />
          </div>

          {/* Preço */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Preço (R$)</label>
            <input
              required
              type="number"
              step="0.01"
              min="0"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              placeholder="0,00"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
            />
          </div>

          {/* Checkboxes */}
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.isAddon}
                onChange={(e) => setForm({ ...form, isAddon: e.target.checked })}
                className="accent-primary"
              />
              É cobertura/adicional
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.available}
                onChange={(e) => setForm({ ...form, available: e.target.checked })}
                className="accent-primary"
              />
              Disponível
            </label>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-border rounded-lg py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-primary text-primary-foreground rounded-lg py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
