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
            <div className="fixed top-2 right-3 z-50 bg-yellow-400 text-yellow-900 text-[11px] font-bold px-2 py-0.5 rounded">
              HOMOLOG
            </div>
          )}
          <Sidebar />
          <WhatsAppStatus />
          <main className="ml-56 h-screen overflow-auto bg-background">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  )
}
