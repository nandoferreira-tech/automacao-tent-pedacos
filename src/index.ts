import 'dotenv/config'
import { handleMessage } from './handlers/messageHandler.js'
import { startInternalServer } from './server.js'

const PROVIDER     = process.env['WHATSAPP_PROVIDER'] ?? 'wwebjs'
const WPP_ENABLED  = process.env['WPP_ENABLED'] !== 'false'
const internalPort = Number(process.env['INTERNAL_PORT'] ?? 3001)
const webhookPort  = Number(process.env['EVOLUTION_WEBHOOK_PORT'] ?? 3002)

if (!WPP_ENABLED) {
  // Modo homologação: sobe apenas o servidor interno (dashboard funciona normalmente)
  // sem conectar ao WhatsApp — evita conflito de sessão com produção.
  console.log('⚠  WPP_ENABLED=false — rodando sem WhatsApp (modo homolog).')
  startInternalServer(internalPort)

} else if (PROVIDER === 'evolution') {
  const { startEvolutionAdapter } = await import('./adapters/EvolutionApiAdapter.js')
  startEvolutionAdapter(internalPort, webhookPort, handleMessage)

} else {
  // Padrão: whatsapp-web.js
  const { startWwebjsAdapter } = await import('./adapters/WwebjsAdapter.js')
  startWwebjsAdapter(internalPort, handleMessage)
}
