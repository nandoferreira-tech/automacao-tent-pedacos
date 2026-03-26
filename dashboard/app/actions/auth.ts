'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { signToken } from '@/lib/auth'

const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD ?? ''

export async function login(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const password = formData.get('password') as string

  if (!password || password !== DASHBOARD_PASSWORD) {
    return 'Senha incorreta. Tente novamente.'
  }

  const cookieStore = await cookies()
  cookieStore.set('session', signToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  })

  redirect('/pedidos')
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete('session')
  redirect('/login')
}
