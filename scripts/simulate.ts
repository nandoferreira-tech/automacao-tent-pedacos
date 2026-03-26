/**
 * Simulador de conversa — testa o agente sem precisar do WhatsApp.
 * Uso: npx tsx scripts/simulate.ts
 */
import dotenv from 'dotenv'
dotenv.config()

import * as readline from 'readline'
import { processMessage } from '../src/agent/agentService.js'

const PHONE = '5511999990000'
const NAME  = 'Cliente Teste'

const history: Array<{ role: 'user' | 'model'; text: string }> = []

const rl = readline.createInterface({
  input:  process.stdin,
  output: process.stdout,
})

console.log('─────────────────────────────────────────')
console.log('  Simulador Paty — Tentação em Pedaços')
console.log('  Digite sua mensagem ou "sair" para encerrar.')
console.log('─────────────────────────────────────────\n')

function prompt() {
  rl.question('Você: ', async (input) => {
    const text = input.trim()

    if (!text || text.toLowerCase() === 'sair') {
      console.log('\nEncerrando simulação. Até mais! 🎂')
      rl.close()
      return
    }

    try {
      const response = await processMessage(PHONE, NAME, text, history)

      // Atualiza histórico
      history.push({ role: 'user',  text })
      history.push({ role: 'model', text: response.text })
      if (history.length > 20) history.splice(0, 2)

      console.log(`\nPaty: ${response.text}`)

      if (response.orderCreated) {
        console.log(`\n[SISTEMA] Pedido criado: #${response.orderCreated.orderId} | R$ ${response.orderCreated.total.toFixed(2)} | ${response.orderCreated.paymentMethod}`)
        if (response.orderCreated.paymentMethod === 'pix') {
          console.log('[SISTEMA] Cliente deve enviar comprovante Pix.')
        }
      }

      if (response.transferToAttendant) {
        console.log('[SISTEMA] Transferência solicitada — atendente seria notificado.')
      }

      console.log()
    } catch (err) {
      console.error('[ERRO]', err)
    }

    prompt()
  })
}

prompt()
