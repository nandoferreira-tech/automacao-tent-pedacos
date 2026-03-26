'use client'
import { Pencil, Trash2 } from 'lucide-react'

export interface Product {
  id: string
  category: string
  subcategory: string | null
  name: string
  description: string | null
  price: number
  isAddon: boolean
  available: boolean
}

const categoryEmoji: Record<string, string> = {
  'bolos-no-pote':   '🫙',
  'bolos-artesanais': '🎂',
  'coberturas':       '🍫',
}

interface Props {
  product: Product
  onEdit: (p: Product) => void
  onDelete: (id: string) => void
  onToggleAvailable: (id: string, available: boolean) => void
}

export function ProductCard({ product, onEdit, onDelete, onToggleAvailable }: Props) {
  const emoji = categoryEmoji[product.category] ?? '🍰'

  return (
    <div className={`bg-card rounded-xl border border-border p-4 flex gap-4 shadow-sm transition-opacity ${!product.available ? 'opacity-60' : ''}`}>
      {/* Thumbnail */}
      <div className="w-16 h-16 rounded-lg bg-accent flex items-center justify-center text-3xl shrink-0">
        {emoji}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-sm text-gray-900 truncate">{product.name}</p>
            {product.subcategory && (
              <span className="text-xs text-muted-foreground">{product.subcategory}</span>
            )}
            {product.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{product.description}</p>
            )}
          </div>
          <p className="text-sm font-bold text-primary shrink-0">
            R$ {product.price.toFixed(2).replace('.', ',')}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-3">
          {/* Toggle disponível */}
          <button
            onClick={() => onToggleAvailable(product.id, !product.available)}
            className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
              product.available
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {product.available ? '● Disponível' : '○ Indisponível'}
          </button>

          <div className="flex gap-1">
            <button
              onClick={() => onEdit(product)}
              className="p-1.5 text-gray-400 hover:text-primary hover:bg-accent rounded-lg transition-colors"
              title="Editar"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => onDelete(product.id)}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Excluir"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
