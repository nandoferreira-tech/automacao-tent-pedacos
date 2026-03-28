import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/Providers'
import { Sidebar } from '@/components/layout/Sidebar'
import { WhatsAppStatus } from '@/components/layout/WhatsAppStatus'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Tentação em Pedaços — Painel',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const isHomolog = process.env.NEXT_PUBLIC_APP_ENV === 'homolog'
  return (
    <html lang="pt-BR">
      <body className={`${inter.className} overflow-hidden`}>
        <Providers>
          {isHomolog && (
            <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-400 text-yellow-900 text-xs font-bold text-center py-1.5 tracking-widest shadow-sm border-b border-yellow-500 select-none">
              ⚠️ HOMOLOG — Ambiente de Testes
            </div>
          )}
          <Sidebar />
          <WhatsAppStatus />
          <main className={`ml-56 h-screen overflow-auto bg-background${isHomolog ? ' pt-7' : ''}`}>
            {children}
          </main>
        </Providers>
      </body>
    </html>
  )
}
