import { type NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

export const dynamic = 'force-dynamic'

const execAsync = promisify(exec)

const RESTART_COMMANDS: Record<string, string> = {
  'agente-prod':       'pm2 restart agente-prod 2>&1',
  'dashboard-prod':    'pm2 restart dashboard-prod 2>&1',
  'agente-homolog':    'pm2 restart agente-homolog 2>&1',
  'dashboard-homolog': 'pm2 restart dashboard-homolog 2>&1',
  'traefik':   'docker restart $(docker ps -q --filter "name=proxy_traefik" --format "{{.ID}}") 2>&1',
  'postgres':  'docker restart $(docker ps -q --filter "name=netbox_postgres" --format "{{.ID}}") 2>&1',
  'redis':     'docker restart $(docker ps -q --filter "name=netbox_redis" --format "{{.ID}}") 2>&1',
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ service: string }> }
) {
  const { service } = await params
  const cmd = RESTART_COMMANDS[service]
  if (!cmd) {
    return NextResponse.json({ error: 'Serviço não encontrado ou não pode ser reiniciado' }, { status: 404 })
  }
  try {
    const { stdout, stderr } = await execAsync(cmd)
    return NextResponse.json({ ok: true, output: stdout || stderr })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
