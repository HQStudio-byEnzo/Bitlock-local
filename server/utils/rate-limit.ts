import type { H3Event } from 'h3'

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

/**
 * Adresse de la connexion TCP. BitLock tourne en local, sans proxy devant :
 * X-Forwarded-For viendrait du client lui-même, qui pourrait changer d'IP à
 * chaque requête et échapper aux limites.
 */
function clientAddress(event: H3Event) {
  return getRequestIP(event) || 'unknown'
}

export function enforceRateLimit(
  event: H3Event,
  scope: string,
  limit: number,
  windowMs: number,
  discriminator = '',
  { perClient = true } = {},
) {
  const now = Date.now()
  // perClient: false compte toutes les adresses ensemble (ex. essais sur un même compte).
  const key = `${scope}:${perClient ? clientAddress(event) : '*'}:${discriminator}`
  const current = store.get(key)

  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return
  }

  current.count += 1
  if (current.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000))
    setResponseHeader(event, 'Retry-After', retryAfter)
    throw createError({
      statusCode: 429,
      message: 'Too many requests. Please try again later.',
    })
  }

  // Prevent unbounded growth on long-lived development/server processes.
  if (store.size > 10_000) {
    for (const [entryKey, entry] of store) {
      if (entry.resetAt <= now) store.delete(entryKey)
    }
  }
}
