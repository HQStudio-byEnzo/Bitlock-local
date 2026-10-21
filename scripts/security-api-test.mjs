// Régressions de sécurité de l'API, contre un serveur lancé (comme test:smoke).
// SECURITY_BASE_URL=http://localhost:3000 DB_PATH=./data/bitlock.db bun scripts/security-api-test.mjs
import { createClient } from '@libsql/client'

const baseURL = process.env.SECURITY_BASE_URL || 'http://localhost:3000'
const dbPath = process.env.DB_PATH || './data/bitlock.db'
const stamp = Date.now()
const username = `secprobe_${stamp}`
const password = 'Security-Probe-2026!'
const results = {}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function call(path, { method = 'GET', body, cookie, headers = {} } = {}) {
  const h = new Headers(headers)
  if (body) h.set('content-type', 'application/json')
  if (cookie) h.set('cookie', cookie)
  if (method !== 'GET') { h.set('origin', baseURL); h.set('sec-fetch-site', 'same-origin') }
  const response = await fetch(`${baseURL}${path}`, { method, headers: h, body: body && JSON.stringify(body) })
  const setCookie = response.headers.get('set-cookie')
  const text = await response.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { status: response.status, data, cookie: setCookie ? setCookie.split(';', 1)[0] : null }
}

async function cleanup() {
  const db = createClient({ url: `file:${dbPath}` })
  try {
    const users = await db.execute("SELECT id FROM users WHERE username LIKE 'secprobe_%'")
    for (const row of users.rows) {
      const id = String(row.id)
      for (const table of ['vault_item_history', 'vault_items', 'tags', 'folders', 'vaults', 'master_verifiers', 'extension_tokens', 'accepted_terms']) {
        await db.execute({ sql: `DELETE FROM ${table} WHERE user_id = ?`, args: [id] }).catch(() => {})
      }
      await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [id] })
    }
  } finally { db.close() }
}

const b64 = bytes => Buffer.from(bytes).toString('base64')
const salt = b64(new Uint8Array(16).fill(1))
const ct = b64(new Uint8Array(32).fill(2))
const iv = b64(new Uint8Array(12).fill(3))

try {
  await cleanup()
  const registration = await call('/api/auth/register', { method: 'POST', body: { username, password, passwordHint: 'indice', acceptedTerms: true } })
  assert(registration.status === 200 && registration.cookie, `register: ${registration.status}`)
  const cookie = registration.cookie

  // Format chiffré : nouveau format accepté, ancien refusé à l'écriture.
  assert((await call('/api/vault', { method: 'POST', cookie, body: { type: 'note', label: 'x', payload: `v2:600000:${salt}:${ct}`, iv } })).status === 200,
    'format v2 refusé')
  assert((await call('/api/vault', { method: 'POST', cookie, body: { type: 'note', label: 'x', payload: `${salt}:${ct}`, iv } })).status === 400,
    'ancien format accepté à l’écriture')
  results.kdfV2 = true

  // Indice : un échec de connexion ouvre une seule lecture.
  const failed = await call('/api/auth/login', { method: 'POST', body: { username, password: 'mauvais-mot-de-passe' } })
  assert(failed.status === 401 && failed.cookie, 'login raté')
  const first = await call(`/api/auth/hint?username=${username}`, { cookie: failed.cookie })
  assert(first.status === 200 && first.data.hint === 'indice', `indice: ${first.status}`)
  const again = await call(`/api/auth/hint?username=${username}`, { cookie: first.cookie || failed.cookie })
  assert(again.status === 403, `indice relisible avec le même défi (${again.status})`)
  results.hintSingleUse = true

  // Changer d'IP annoncée (X-Forwarded-For) ne contourne pas la limite par compte.
  let limited = false
  for (let attempt = 0; attempt < 20 && !limited; attempt += 1) {
    const guess = await call('/api/auth/login', {
      method: 'POST',
      body: { username, password: `essai-${attempt}` },
      headers: { 'x-forwarded-for': `203.0.113.${attempt + 1}` },
    })
    limited = guess.status === 429
  }
  assert(limited, 'limite de connexion contournée par X-Forwarded-For')
  results.loginLimitIgnoresForwardedFor = true

  console.log(JSON.stringify({ ok: true, ...results }))
} finally {
  await cleanup()
}
