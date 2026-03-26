/**
 * Serviço de Pix — versão de teste (v1)
 *
 * Fluxo simplificado:
 * 1. Bot envia a chave Pix + valor ao cliente
 * 2. Cliente paga e envia o comprovante (imagem ou PDF) na conversa
 * 3. Bot detecta o comprovante e encaminha ao atendente (invisível ao cliente)
 * 4. Atendente valida e o bot confirma o pedido ao cliente
 *
 * TODO (v2): substituir por cobrança automática via OpenPix/Woovi
 */

const PIX_PHONE = process.env['PIX_PHONE'] ?? '5511969585343'

/**
 * Retorna a mensagem de instrução de pagamento Pix para enviar ao cliente.
 */
export function formatPixInstructions(valueInCents: number, orderId: string): string {
  const value = (valueInCents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })

  return [
    `💰 *Pagamento — ${value}*`,
    '',
    'Envie um Pix para a chave abaixo:',
    '',
    `📱 *Chave Pix (telefone):* ${PIX_PHONE}`,
    `💵 *Valor:* ${value}`,
    `🧾 *Pedido:* #${orderId}`,
    '',
    'Após o pagamento, *envie o comprovante aqui nessa conversa* (imagem ou PDF).',
    'Seu pedido será confirmado assim que validarmos o pagamento. 🎂',
  ].join('\n')
}

/**
 * Retorna a mensagem encaminhada ao atendente com o comprovante do cliente.
 * Enviada de forma silenciosa — o cliente não vê.
 */
export function formatAttendantNotification(
  customerPhone: string,
  customerName: string,
  orderId: string,
  valueInCents: number,
): string {
  const value = (valueInCents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })

  return [
    `🧾 *Comprovante Pix recebido*`,
    '',
    `👤 Cliente: ${customerName} (${customerPhone})`,
    `📦 Pedido: #${orderId}`,
    `💵 Valor esperado: ${value}`,
    '',
    'Para *confirmar* o pedido, responda:',
    `✅ \`confirmar ${orderId}\``,
    '',
    'Para *recusar* (valor incorreto, comprovante inválido):',
    `❌ \`recusar ${orderId}\``,
  ].join('\n')
}
