/**
 * WwebjsAdapter — adapta whatsapp-web.js para as interfaces WppClient / WppMessage.
 *
 * Ativado com: WHATSAPP_PROVIDER=wwebjs  (padrão)
 */

import pkg from 'whatsapp-web.js'
const { Client, LocalAuth, MessageMedia } = pkg
import qrcode from 'qrcode-terminal'
import type { WppClient, WppMessage, WppMedia, MessageHandler } from './types.js'
import { startInternalServer, setWhatsAppClient, setWppStatus } from '../server.js'

function adaptClient(raw: InstanceType<typeof Client>): WppClient {
  return {
    async sendMessage(to, content, opts) {
      if (typeof content === 'string') {
        await raw.sendMessage(to, content)
      } else {
        const media = new MessageMedia(content.mimetype, content.data)
        await raw.sendMessage(to, media, opts as object)
      }
    },
  }
}

function adaptMessage(raw: pkg.Message, client: WppClient): WppMessage {
  return {
    from: raw.from,
    body: raw.body,
    hasMedia: raw.hasMedia,

    async reply(text) {
      await raw.reply(text)
    },

    async getContact() {
      const c = await raw.getContact()
      return { pushname: c.pushname ?? '' }
    },

    async downloadMedia() {
      const media = await raw.downloadMedia()
      if (!media) return null
      return { mimetype: media.mimetype, data: media.data }
    },
  }
}

export function startWwebjsAdapter(
  internalPort: number,
  onMessage: MessageHandler,
): void {
  // Servidor interno sobe imediatamente para o endpoint /wpp-status estar disponível
  // mesmo antes do WhatsApp conectar
  startInternalServer(internalPort)

  const raw = new Client({
    authStrategy: new LocalAuth({ clientId: process.env['WPP_SESSION_NAME'] ?? 'agente-wpp' }),
    puppeteer: { headless: true, args: ['--no-sandbox'] },
    qrMaxRetries: 15,
  })

  raw.on('qr', (qr) => {
    console.log('Escaneie o QR code abaixo com o WhatsApp:')
    qrcode.generate(qr, { small: true })
    setWppStatus('qr', qr)
  })

  raw.on('ready', () => {
    console.log(`✓ Agente "${process.env['AGENT_NAME'] ?? 'Tentação em Pedaços'}" conectado (wwebjs).`)
    const client = adaptClient(raw)
    setWhatsAppClient(client)
    setWppStatus('connected')
  })

  raw.on('message', async (message) => {
    if (message.from.endsWith('@g.us')) return
    const client = adaptClient(raw)
    await onMessage(client, adaptMessage(message, client))
  })

  raw.on('disconnected', (reason) => {
    console.error('Desconectado:', reason)
    setWppStatus('disconnected')
    process.exit(1)
  })

  raw.initialize()
}
