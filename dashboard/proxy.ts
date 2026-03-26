import { NextRequest, NextResponse } from 'next/server'

// Auth temporariamente desativada
export function proxy(_req: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
