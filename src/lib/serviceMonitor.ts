import net from 'net'
import { getWhatsAppClient } from '../server.js'

const COMPANY_PHONE = process.env['COMPANY_PHONE'] ?? ''
const CHECK_INTERVAL_MS = 60_000
const ALERT_COOLDOWN_MS = 10 * 60_000

interface MonitoredService {
  id: string
  name: string
  port: number
}

const SERVICES: MonitoredService[] = [
  { id: 'agente-prod',       name: 'Agente WhatsApp (Produção)',  port: 3001 },
  { id: 'dashboard-prod',    name: 'Dashboard Web (Produção)',     port: 3000 },
  { id: 'agente-homolog',    name: 'Agente WhatsApp (Homolog)',    port: 3101 },
  { id: 'dashboard-homolog', name: 'Dashboard Web (Homolog)',      port: 3100 },
]

const lastStatus = new Map<string, 'running' | 'stopped'>()
const lastAlertTime = new Map<string, number>()

function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const timer = setTimeout(() => { socket.destroy(); resolve(false) }, 3000)
    socket.connect(port, '127.0.0.1', () => {
      clearTimeout(timer)
      socket.destroy()
      resolve(true)
    })
    socket.on('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
  })
}

async function sendAlert(serviceId: string, serviceName: string, isDown: boolean): Promise<void> {
  if (!COMPANY_PHONE) return
  const client = getWhatsAppClient()
  if (!client) return

  if (isDown) {
    const now = Date.now()
    const last = lastAlertTime.get(serviceId) ?? 0
    if (now - last < ALERT_COOLDOWN_MS) return
    lastAlertTime.set(serviceId, now)
    await client.sendMessage(`${COMPANY_PHONE}@c.us`, [
      '🚨 *Alerta do Servidor*',
      '',
      `O serviço *${serviceName}* está *fora do ar*.`,
      '',
      'Para reiniciar, responda:',
      `*reiniciar ${serviceId}*`,
      '',
      'Ou ignore esta mensagem para não tomar ação.',
    ].join('\n'))
  } else {
    await client.sendMessage(`${COMPANY_PHONE}@c.us`,
      `✅ *Serviço restaurado*\n\nO serviço *${serviceName}* voltou a funcionar normalmente.`)
  }
}

async function checkAll(): Promise<void> {
  for (const svc of SERVICES) {
    try {
      const running = await checkPort(svc.port)
      const current: 'running' | 'stopped' = running ? 'running' : 'stopped'
      const previous = lastStatus.get(svc.id)
      if (previous !== undefined && previous !== current) {
        await sendAlert(svc.id, svc.name, !running)
      }
      lastStatus.set(svc.id, current)
    } catch (err) {
      console.error(`[serviceMonitor] Erro ao checar ${svc.id}:`, err)
    }
  }
}

export function startServiceMonitor(): void {
  setTimeout(() => {
    void checkAll()
    setInterval(() => { void checkAll() }, CHECK_INTERVAL_MS)
  }, 30_000)
  console.log('✓ Monitor de serviços iniciado (intervalo: 60s)')
}
