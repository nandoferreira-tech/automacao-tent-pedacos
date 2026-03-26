'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/pedidos', label: '🛒 Pedidos Ativos' },
  { href: '/historico', label: '📦 Histórico' },
  { href: '/financeiro', label: '💰 Financeiro' },
]

export function Navbar() {
  const path = usePathname()
  return (
    <header className="border-b bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-6 h-14">
        <span className="font-bold text-pink-600 text-lg">🎂 Tentação em Pedaços</span>
        <nav className="flex gap-1">
          {tabs.map((t) => (
            <Link key={t.href} href={t.href}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                path.startsWith(t.href) ? 'bg-pink-100 text-pink-700' : 'text-gray-600 hover:bg-gray-100'
              }`}>
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
