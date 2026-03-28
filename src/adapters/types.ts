/**
 * Interfaces abstratas de WhatsApp — desacoplam o agente do provedor concreto.
 *
 * Provedores suportados:
 *   WHATSAPP_PROVIDER=wwebjs      → whatsapp-web.js (padrão, gratuito)
 *   WHATSAPP_PROVIDER=evolution   → Evolution API (baileys gratuito ou Meta Cloud API pago)
 */

export interface WppMedia {
  mimetype: string
  data: string  // base64
}

export interface WppContact {
  pushname: string
  /** Número real em formato internacional, ex: "5511984380212" (vazio se não resolvido) */
  number: string
}

export interface WppMessage {
  /** Remetente no formato "5511999999999@c.us" */
  from: string
  body: string
  hasMedia: boolean
  reply: (text: string) => Promise<void>
  getContact: () => Promise<WppContact>
  downloadMedia: () => Promise<WppMedia | null>
}

export interface WppClient {
  sendMessage: (
    to: string,
    content: string | WppMedia,
    opts?: { caption?: string },
  ) => Promise<void>
}

export type MessageHandler = (client: WppClient, message: WppMessage) => Promise<void>
