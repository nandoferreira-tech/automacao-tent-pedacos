import { createServer } from 'http'
import { exec } from 'child_process'
import type { WppClient } from './adapters/types.js'

const RESTART_COMMANDS: Record<string, string> = {
  'agente-prod':       'pm2 restart agente-prod',
  'dashboard-prod':    'pm2 restart dashboard-prod',
  'agente-homolog':    'pm2 restart agente-homolog',
  'dashboard-homolog': 'pm2 restart dashboard-homolog',
  'traefik':   'docker restart $(docker ps -q --filter "name=proxy_traefik")',
  'postgres':  'docker restart $(docker ps -q --filter "name=netbox_postgres")',
  'redis':     'docker restart $(docker ps -q --filter "name=netbox_redis")',
}

let wppClient: WppClient | null = null
let wppStatus: 'starting' | 'qr' | 'connected' | 'disconnected' = 'starting'
let wppQr: string | null = null

export function setWhatsAppClient(client: WppClient) {
  wppClient = client
}

export function getWhatsAppClient(): WppClient | null {
  return wppClient
}

export function setWppStatus(status: typeof wppStatus, qr?: string): void {
  wppStatus = status
  wppQr = qr ?? null
}

export function startInternalServer(port = 3001) {
  const server = createServer((req, res) => {

    if (req.method === 'GET' && req.url === '/internal/wpp-status') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: wppStatus, qr: wppQr }))
      return
    }

    if (req.method === 'POST' && req.url === '/internal/send') {
      let body = ''
      req.on('data', (chunk: Buffer) => { body += chunk.toString() })
      req.on('end', async () => {
        try {
          const { phone, mensagem } = JSON.parse(body) as { phone: string; mensagem: string }
          if (wppClient) await wppClient.sendMessage(`${phone}@c.us`, mensagem)
          res.writeHead(200)
          res.end(JSON.stringify({ ok: true }))
        } catch {
          res.writeHead(500)
          res.end(JSON.stringify({ error: 'Erro interno' }))
        }
      })
      return
    }

    if (req.method === 'POST' && req.url === '/internal/restart-service') {
      let body = ''
      req.on('data', (chunk: Buffer) => { body += chunk.toString() })
      req.on('end', () => {
        try {
          const { serviceId } = JSON.parse(body) as { serviceId: string }
          const cmd = RESTART_COMMANDS[serviceId]
          if (!cmd) {
            res.writeHead(404)
            res.end(JSON.stringify({ error: 'Serviço não encontrado' }))
            return
          }
          exec(cmd, (err, stdout, stderr) => {
            if (err) {
              res.writeHead(500)
              res.end(JSON.stringify({ ok: false, error: err.message }))
            } else {
              res.writeHead(200)
              res.end(JSON.stringify({ ok: true, output: stdout || stderr }))
            }
          })
        } catch {
          res.writeHead(400)
          res.end(JSON.stringify({ error: 'Body inválido' }))
        }
      })
      return
    }

    res.writeHead(404)
    res.end()
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`⚠️  Porta ${port} já em uso — servidor interno não iniciado.`)
    } else {
      console.error('[server] Erro:', err)
    }
  })

  server.listen(port, () => console.log(`✓ Servidor interno na porta ${port}`))
}
