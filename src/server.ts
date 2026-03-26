import { createServer } from 'http'

type WppClient = { sendMessage: (to: string, msg: string) => Promise<unknown> }
let wppClient: WppClient | null = null

export function setWhatsAppClient(client: WppClient) {
  wppClient = client
}

export function startInternalServer(port = 3001) {
  const server = createServer((req, res) => {
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
    } else {
      res.writeHead(404)
      res.end()
    }
  })
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`⚠️  Porta ${port} já em uso — servidor interno não iniciado. Notificações WhatsApp pelo dashboard podem não funcionar.`)
    } else {
      console.error('[server] Erro:', err)
    }
  })
  server.listen(port, () => console.log(`✓ Servidor interno na porta ${port}`))
}
