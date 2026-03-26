'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, BarChart2, ShoppingBag, DollarSign,
  Star, Users, Megaphone, UtensilsCrossed, Settings,
} from 'lucide-react'

const sections = [
  {
    items: [
      { href: '/pedidos', label: 'Início', icon: Home },
    ],
  },
  {
    title: 'Desempenho e vendas',
    items: [
      { href: '/desempenho', label: 'Desempenho', icon: BarChart2, placeholder: true },
      { href: '/pedidos',    label: 'Pedidos',     icon: ShoppingBag },
      { href: '/financeiro', label: 'Financeiro',  icon: DollarSign },
      { href: '/avaliacoes', label: 'Avaliações',  icon: Star, placeholder: true },
    ],
  },
  {
    title: 'Marketing',
    items: [
      { href: '/clientes',  label: 'Seus clientes', icon: Users, placeholder: true },
      { href: '/promocoes', label: 'Promoções',      icon: Megaphone, placeholder: true },
    ],
  },
  {
    title: 'Configurações da loja',
    items: [
      { href: '/cardapio',      label: 'Cardápios',    icon: UtensilsCrossed },
      { href: '/configuracoes', label: 'Configurações', icon: Settings, placeholder: true },
    ],
  },
]

export function Sidebar() {
  const path = usePathname()

  function isActive(href: string) {
    if (href === '/pedidos') return path === '/pedidos' || path === '/'
    return path.startsWith(href)
  }

  return (
    <aside className="fixed top-0 left-0 h-screen w-56 bg-white border-r border-border flex flex-col z-20 overflow-y-auto">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 pt-5 pb-4 shrink-0">
        <span className="text-2xl">🎂</span>
        <div className="leading-tight">
          <p className="font-bold text-[13px] text-gray-900 leading-none">Tentação em Pedaços</p>
          <button className="text-[11px] text-primary font-medium mt-0.5 hover:underline">Trocar loja</button>
        </div>
      </div>

      {/* Status da loja */}
      <div className="mx-3 mb-4 px-3 py-2 rounded-lg border border-border bg-gray-50 flex items-center justify-between shrink-0">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            <span className="text-xs font-semibold text-gray-800">Loja aberta</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">No horário programado</p>
        </div>
        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0 flex-1 pb-4">
        {sections.map((section, si) => (
          <div key={si} className="mb-1">
            {section.title && (
              <p className="px-4 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {section.title}
              </p>
            )}
            {section.items.map(({ href, label, icon: Icon, placeholder }) => {
              const active = isActive(href)
              return (
                <Link
                  key={`${href}-${label}`}
                  href={placeholder ? '#' : href}
                  onClick={placeholder ? (e) => e.preventDefault() : undefined}
                  className={`flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                    active
                      ? 'bg-red-50 text-primary'
                      : placeholder
                      ? 'text-gray-400 cursor-default hover:bg-transparent'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon size={17} strokeWidth={active ? 2.5 : 1.8} />
                  {label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>
    </aside>
  )
}
