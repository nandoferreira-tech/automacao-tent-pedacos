/**
 * EvolutionApiAdapter — integra o agente à Evolution API via webhooks + REST.
 *
 * Ativado com: WHATSAPP_PROVIDER=evolution
 *
 * A Evolution API pode usar dois backends:
 *   - Baileys (gratuito, open-source) → igual ao whatsapp-web.js em custo
 *   - WhatsApp Business Cloud API (Meta, pago) → basta trocar no painel da Evolution API
 *
 * Configuração necessária no .env:
 *   EVOLUTION_API_URL=http://localhost:8080
 *   EVOLUTION_API_KEY=sua-chave-aqui
 *   EVOLUTION_INSTANCE=agente-prod
 *   EVOLUTION_WEBHOOK_PORT=3002   (porta onde este adapter escuta webhooks)
 *
 * Na Evolution API, configure o webhook para apontar para:
 *   http://<vm-ip>:3002/webhook
 *
 * Eventos a habilitar na instância:
 *   - MESSAGES_UPSERT
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import type { WppClient, WppMessage, WppMedia, MessageHandler } from './types.js'
import { startInternalServer, setWhatsAppClient } from '../server.js'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const EVOLUTION_API_URL  = process.env['EVOLUTION_API_URL']  ?? 'http://localhost:8080'
const EVOLUTION_API_KEY  = process.env['EVOLUTION_API_KEY']  ?? ''
const EVOLUTION_INSTANCE = process.env['EVOLUTION_INSTANCE'] ?? 'agente'

// ---------------------------------------------------------------------------
// REST helper
// ---------------------------------------------------------------------------
async function evolutionPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${EVOLUTION_API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Evolution API ${res.status}: ${text}`)
  }
  return res.json()
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------
function createEvolutionClient(): WppClient {
  return {
    async sendMessage(to, content, opts) {
      const number = to.replace(/@[a-z.]+$/i, '')

      if (typeof content === 'string') {
        await evolutionPost(`/message/sendText/${EVOLUTION_INSTANCE}`, {
          number,
          text: content,
        })
      } else {
        const [mediatype] = content.mimetype.split('/')
        await evolutionPost(`/message/sendMedia/${EVOLUTION_INSTANCE}`, {
          number,
          mediatype: mediatype ?? 'image',
          caption: opts?.caption ?? '',
          media: content.data,
        })
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Webhook payload → WppMessage
// ---------------------------------------------------------------------------

type EvolutionPayload = {
  event: string
  data: {
    key: { remoteJid: string; fromMe: boolean; id: string }
    message: Record<string, unknown>
    messageType: string
    pushName?: string
    senderPn?: string  // v2.3.5+ — número real quando remoteJid é @lid
  }
}

const MEDIA_TYPES = ['imageMessage', 'documentMessage', 'audioMessage', 'videoMessage']

function parsePayload(payload: EvolutionPayload): WppMessage | null {
  if (payload.event !== 'messages.upsert') return null
  if (payload.data.key.fromMe) return null

  const { remoteJid } = payload.data.key
  if (remoteJid.endsWith('@g.us')) return null

  const msg = payload.data.message
  const pushName = payload.data.pushName ?? ''

  const bodyText = String(
    msg['conversation'] ??
    (msg['extendedTextMessage'] as Record<string, unknown> | undefined)?.['text'] ??
    '',
  )

  const hasMedia = MEDIA_TYPES.some((t) => t in msg)

  // Resolve @lid → número real usando senderPn (Evolution API v2.3.5+)
  const resolvedJid = remoteJid.endsWith('@lid') && payload.data.senderPn
    ? `${payload.data.senderPn}@s.whatsapp.net`
    : remoteJid

  // Normaliza para @c.us (padrão do projeto)
  const from = resolvedJid.replace('@s.whatsapp.net', '@c.us')

  // Número real sem sufixo (para getContact)
  const realNumber = resolvedJid.replace(/@[a-z.]+$/i, '')

  const client = createEvolutionClient()

  return {
    from,
    body: bodyText,
    hasMedia,

    async reply(text) {
      await client.sendMessage(from, text)
    },

    async getContact() {
      return { pushname: pushName, number: realNumber }
    },

    async downloadMedia(): Promise<WppMedia | null> {
      if (!hasMedia) return null
      try {
        const res = await fetch(
          `${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${EVOLUTION_INSTANCE}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
            body: JSON.stringify({ message: { key: payload.data.key, message: msg } }),
          },
        )
        if (!res.ok) return null
        const json = await res.json() as { base64: string; mimetype: string }
        return { data: json.base64, mimetype: json.mimetype }
      } catch {
        return null
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Webhook server
// ---------------------------------------------------------------------------
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    req.on('end', () => resolve(body))
  })
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------
export function startEvolutionAdapter(
  internalPort: number,
  webhookPort: number,
  onMessage: MessageHandler,
): void {
  const client = createEvolutionClient()
  setWhatsAppClient(client)
  startInternalServer(internalPort)

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'POST' && req.url === '/webhook') {
      const raw = await readBody(req)
      res.writeHead(200).end()  // responde 200 imediatamente (Evolution API exige)

      try {
        const payload = JSON.parse(raw) as EvolutionPayload
        const message = parsePayload(payload)
        if (message) await onMessage(client, message)
      } catch (err) {
        console.error('[evolution] Erro ao processar webhook:', err)
      }
      return
    }
    res.writeHead(404).end()
  })

  server.listen(webhookPort, () =>
    console.log(`✓ Evolution API webhook escutando na porta ${webhookPort} (/webhook)`),
  )

  console.log(`✓ Agente "${process.env['AGENT_NAME'] ?? 'Tentação em Pedaços'}" iniciado (Evolution API).`)
  console.log(`  Configure o webhook da instância "${EVOLUTION_INSTANCE}" para: http://<vm>:${webhookPort}/webhook`)
}
