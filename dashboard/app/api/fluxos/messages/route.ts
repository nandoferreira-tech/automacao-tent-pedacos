import { type NextRequest, NextResponse } from 'next/server'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

export const dynamic = 'force-dynamic'

const CONFIG_PATH = join(process.cwd(), '..', 'config', 'flow-messages.json')

export async function GET() {
  try {
    if (!existsSync(CONFIG_PATH)) return NextResponse.json([])
    const data = readFileSync(CONFIG_PATH, 'utf-8')
    return NextResponse.json(JSON.parse(data))
  } catch {
    return NextResponse.json([])
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    writeFileSync(CONFIG_PATH, JSON.stringify(body, null, 2), 'utf-8')
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
