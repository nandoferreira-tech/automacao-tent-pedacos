import 'dotenv/config'
import { setWhatsAppClient, startInternalServer } from './server.js'
import pkg from 'whatsapp-web.js'
const { Client, LocalAuth } = pkg
import qrcode from 'qrcode-terminal'
import { handleMessage } from './handlers/messageHandler.js'

const client = new Client({
  authStrategy: new LocalAuth({ clientId: process.env['WPP_SESSION_NAME'] ?? 'agente-wpp' }),
  puppeteer: { headless: true, args: ['--no-sandbox'] },
  qrMaxRetries: 15, // ~5 minutos (cada QR expira em ~20s)
})

client.on('qr', (qr) => {
  console.log('Escaneie o QR code abaixo com o WhatsApp:')
  qrcode.generate(qr, { small: true })
})

client.on('ready', () => {
  console.log(`✓ Agente "${process.env['AGENT_NAME'] ?? 'Tentação em Pedaços'}" conectado.`)
  setWhatsAppClient(client)
  startInternalServer()
})

client.on('message', async (message) => {
  if (message.from.endsWith('@g.us')) return
  await handleMessage(client, message)
})

client.on('disconnected', (reason) => {
  console.error('Desconectado:', reason)
  process.exit(1)
})

client.initialize()
