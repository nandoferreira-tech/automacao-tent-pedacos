import type { IncomingMessage, ServerResponse } from 'http'
import { createServer } from 'http'
import { createClient } from '@woovi/node-sdk'

const woovi = createClient({ appId: process.env['OPENPIX_APP_ID'] ?? '' })

/**
 * Sobe um servidor HTTP simples para receber webhooks da OpenPix.
 * Quando um pagamento é confirmado, atualiza o pedido no banco e notifica o cliente.
 */
export function startWebhookServer(port = 3001): void {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST' || req.url !== '/webhook/pix') {
      res.writeHead(404).end()
      return
    }

    const body = await readBody(req)

    try {
      const payload = JSON.parse(body)

      if (payload?.charge?.status === 'COMPLETED') {
        const correlationID: string = payload.charge.correlationID as string
        await onPaymentConfirmed(correlationID)
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    } catch (err) {
      console.error('[webhook] Erro ao processar payload:', err)
      res.writeHead(400).end()
    }
  })

  server.listen(port, () => {
    console.log(`✓ Webhook Pix escutando em http://localhost:${port}/webhook/pix`)
  })
}

/**
 * Chamado quando o Pix é confirmado pela OpenPix.
 * TODO: atualizar status do pedido no banco para "pago"
 * TODO: notificar o cliente via WhatsApp que o pedido foi confirmado
 * TODO: notificar o WhatsApp da empresa sobre novo pedido pago
 */
async function onPaymentConfirmed(correlationID: string): Promise<void> {
  console.log(`[pix] Pagamento confirmado — correlationID: ${correlationID}`)
  // Extrair orderId do correlationID (formato: "pedido-{orderId}-{uuid}")
  const orderId = correlationID.split('-')[1]
  console.log(`[pix] Pedido ID: ${orderId}`)
  // TODO: db.order.update({ where: { id: orderId }, data: { status: 'pago' } })
  // TODO: wppClient.sendMessage(customerPhone, mensagem de confirmação)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
    req.on('error', reject)
  })
}
