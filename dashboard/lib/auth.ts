import { createHmac, timingSafeEqual } from 'crypto'

const SECRET = process.env.DASHBOARD_SECRET ?? 'changeme-set-DASHBOARD_SECRET-in-env'
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Gera um token de sessão assinado com HMAC-SHA256.
 * Formato: `<expiry_timestamp>.<base64url_signature>`
 */
export function signToken(): string {
  const exp = String(Date.now() + SESSION_DURATION_MS)
  const sig = createHmac('sha256', SECRET).update(exp).digest('base64url')
  return `${exp}.${sig}`
}

/**
 * Verifica se o token é válido e não expirou.
 */
export function verifyToken(token: string): boolean {
  const dotIndex = token.lastIndexOf('.')
  if (dotIndex === -1) return false

  const payload = token.slice(0, dotIndex)
  const sig = token.slice(dotIndex + 1)

  const exp = Number(payload)
  if (isNaN(exp) || Date.now() > exp) return false

  const expected = createHmac('sha256', SECRET).update(payload).digest('base64url')
  try {
    return timingSafeEqual(Buffer.from(sig, 'base64url'), Buffer.from(expected, 'base64url'))
  } catch {
    return false
  }
}
