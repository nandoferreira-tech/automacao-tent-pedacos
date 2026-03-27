import { type NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

export const dynamic = 'force-dynamic'

const execAsync = promisify(exec)

export interface ServiceStatus {
  id: string
  name: string
  description: string
  env: 'prod' | 'homolog' | 'infra'
  status: 'running' | 'stopped' | 'unknown'
  canRestart: boolean
}

const SERVICES = [
  { id: 'agente-prod',       name: 'Agente WhatsApp',          description: 'Bot de atendimento (produção)',       env: 'prod',   port: 3001, restartable: true },
  { id: 'dashboard-prod',    name: 'Dashboard Web',             description: 'Painel de gerenciamento (produção)', env: 'prod',   port: 3000, restartable: true },
  { id: 'agente-homolog',    name: 'Agente WhatsApp (Homolog)', description: 'Bot de atendimento (homologação)',    env: 'homolog',port: 3101, restartable: true },
  { id: 'dashboard-homolog', name: 'Dashboard Web (Homolog)',   description: 'Painel (homologação)',               env: 'homolog',port: 3100, restartable: true },
] as const

const DOCKER_SERVICES = [
  { id: 'traefik',   name: 'Proxy HTTPS',     description: 'Roteamento e certificados SSL',     env: 'infra', filter: 'proxy_traefik',     restartable: true },
  { id: 'postgres',  name: 'Banco de Dados',  description: 'PostgreSQL (NetBox)',                env: 'infra', filter: 'netbox_postgres',   restartable: true },
  { id: 'redis',     name: 'Cache (Redis)',    description: 'Redis in-memory (NetBox)',           env: 'infra', filter: 'netbox_redis',      restartable: true },
  { id: 'portainer', name: 'Portainer',        description: 'Gerenciador de containers',          env: 'infra', filter: 'portainer_portainer', restartable: false },
] as const

const SYSTEMCTL_SERVICES = [
  { id: 'docker',        name: 'Motor Docker',      description: 'Engine de containers Docker',  env: 'infra', svc: 'docker',   restartable: false },
  { id: 'github-runner', name: 'CI/CD (Deploy)',    description: 'GitHub Actions Runner',         env: 'infra', svc: 'actions.runner.nandoferreira-tech-automacao-tent-pedacos.docsrv', restartable: false },
  { id: 'ssh',           name: 'Acesso Remoto SSH', description: 'Servidor OpenSSH',              env: 'infra', svc: 'ssh',      restartable: false },
] as const

async function checkPort(port: number): Promise<'running' | 'stopped'> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2000)
    const res = await fetch(`http://localhost:${port}`, { signal: controller.signal }).catch(() => null)
    clearTimeout(timeout)
    return res ? 'running' : 'stopped'
  } catch {
    return 'stopped'
  }
}

async function checkDocker(filter: string): Promise<'running' | 'stopped' | 'unknown'> {
  try {
    const { stdout } = await execAsync(`docker ps --filter "name=${filter}" --format "{{.Status}}" 2>/dev/null`)
    const line = stdout.trim()
    if (!line) return 'stopped'
    return line.toLowerCase().startsWith('up') ? 'running' : 'stopped'
  } catch {
    return 'unknown'
  }
}

async function checkSystemctl(svc: string): Promise<'running' | 'stopped' | 'unknown'> {
  try {
    const { stdout } = await execAsync(`systemctl is-active ${svc} 2>/dev/null`)
    return stdout.trim() === 'active' ? 'running' : 'stopped'
  } catch {
    return 'stopped'
  }
}

export async function GET(_req: NextRequest) {
  const results = await Promise.all([
    ...SERVICES.map(async (s) => ({
      id: s.id, name: s.name, description: s.description, env: s.env as ServiceStatus['env'],
      status: await checkPort(s.port),
      canRestart: s.restartable,
    })),
    ...DOCKER_SERVICES.map(async (s) => ({
      id: s.id, name: s.name, description: s.description, env: s.env as ServiceStatus['env'],
      status: await checkDocker(s.filter),
      canRestart: s.restartable,
    })),
    ...SYSTEMCTL_SERVICES.map(async (s) => ({
      id: s.id, name: s.name, description: s.description, env: s.env as ServiceStatus['env'],
      status: await checkSystemctl(s.svc),
      canRestart: s.restartable,
    })),
  ])

  return NextResponse.json(results)
}
