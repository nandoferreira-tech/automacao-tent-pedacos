import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({ apiKey: process.env['GOOGLE_API_KEY'] ?? '' })

const CACHE = new Map<string, { text: string; ts: number }>()
const CACHE_TTL = 5 * 60_000 // 5 minutos

/**
 * Retorna uma versão humanizada de um template de mensagem.
 * Usa cache por 5 min e cai no template original se o LLM falhar.
 * @param template - a mensagem base (já contém as informações corretas)
 * @param hint - dica breve para variação do LLM (ex: "welcome back greeting for {name}")
 */
export async function humanize(template: string, hint: string): Promise<string> {
  if (!process.env['GOOGLE_API_KEY']) return template

  const cacheKey = `${hint}:${template.slice(0, 30)}`
  const cached = CACHE.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.text

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-lite',
      contents: [{ role: 'user', parts: [{ text: `Reescreva esta mensagem de atendente de confeitaria de forma levemente diferente, mantendo o mesmo significado, tom amigável e emojis similares. NÃO altere variáveis como {nome} ou {produto}. Retorne APENAS a mensagem reescrita, sem explicações.\n\nMensagem original:\n${template}` }] }],
      config: { temperature: 0.9, maxOutputTokens: 200 },
    })
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    if (text) {
      CACHE.set(cacheKey, { text, ts: Date.now() })
      return text
    }
    return template
  } catch {
    return template
  }
}
