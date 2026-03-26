import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/Providers'
import { Sidebar } from '@/components/layout/Sidebar'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Tentação em Pedaços — Painel',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.className} overflow-hidden`}>
        <Providers>
          <Sidebar />
          <main className="ml-56 h-screen overflow-auto bg-background">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  )
}
