'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { RealtimeProvider } from '@/components/realtime/RealtimeProvider'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeProvider>{children}</RealtimeProvider>
    </QueryClientProvider>
  )
}
