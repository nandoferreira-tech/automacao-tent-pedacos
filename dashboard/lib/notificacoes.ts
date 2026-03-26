const MENSAGENS: Record<string, string> = {
  pago: '✅ Pagamento confirmado! Seu pedido entrou na fila de produção. 🎂',
  em_producao: '👩‍🍳 Seu pedido está sendo preparado com muito carinho!',
  pronto: '🎉 Seu pedido está pronto! Em breve chegará até você.',
  saiu_entrega: '🛵 Seu pedido saiu para entrega! Fique de olho. 🎂',
  entregue: '✅ Pedido entregue! Obrigado por escolher a Tentação em Pedaços! 🎂',
  cancelado: '❌ Seu pedido foi cancelado. Entre em contato para mais informações.',
}

export async function notificarCliente(phone: string, name: string, status: string) {
  const msg = MENSAGENS[status]
  if (!msg) return
  try {
    await fetch('http://localhost:3001/internal/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, mensagem: `Olá, ${name}! ${msg}` }),
    })
  } catch {
    console.warn(`[notificacoes] Agente offline, não foi possível notificar ${phone}`)
  }
}
