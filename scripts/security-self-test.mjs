import { useCrypto } from '../composables/useCrypto.ts'
import { useTotp } from '../composables/useTotp.ts'
import { parsePasswordEntry, serializePasswordEntry } from '../utils/password-entry.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const cryptoTools = useCrypto()
const plaintext = 'bitlock://self-test/é2e'
const password = 'correct horse battery staple'
const envelope = await cryptoTools.encrypt(plaintext, password)
assert(atob(envelope.salt).length === 16, 'AES salt must contain 16 bytes')
assert(atob(envelope.iv).length === 12, 'AES-GCM IV must contain 12 bytes')
assert(await cryptoTools.decrypt(envelope.ciphertext, envelope.iv, password, envelope.salt) === plaintext, 'AES-GCM round trip failed')

// Facteur de travail : 600 000 itérations pour tout nouveau chiffrement, l'ancien format reste lisible.
assert(envelope.iterations === 600_000, 'New encryption must use 600,000 PBKDF2 iterations')
const serialized = cryptoTools.serializeEncryptedPayload(envelope)
assert(serialized.startsWith('v2:600000:'), 'New payloads must be versioned')
assert(cryptoTools.parseEncryptedPayload(serialized).iterations === 600_000, 'Versioned payload lost its KDF work factor')
const legacyKey = await cryptoTools.deriveKey(password, cryptoTools.base64ToArrayBuffer(envelope.salt), 100_000)
const legacyIv = crypto.getRandomValues(new Uint8Array(12))
const legacyCipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: legacyIv }, legacyKey, new TextEncoder().encode(plaintext))
const legacy = cryptoTools.parseEncryptedPayload(`${envelope.salt}:${cryptoTools.arrayBufferToBase64(legacyCipher)}`)
assert(legacy.iterations === 100_000, 'Legacy payloads must keep their 100,000 iterations')
assert(await cryptoTools.decrypt(legacy.ciphertext, cryptoTools.arrayBufferToBase64(legacyIv), password, legacy.salt, legacy.iterations) === plaintext,
  'Legacy payloads are no longer readable')

let rejectedWrongPassword = false
try { await cryptoTools.decrypt(envelope.ciphertext, envelope.iv, 'wrong password', envelope.salt) }
catch { rejectedWrongPassword = true }
assert(rejectedWrongPassword, 'AES-GCM accepted the wrong password')

const credential = parsePasswordEntry(serializePasswordEntry({
  username: 'enzo',
  password: 'correct horse battery staple',
}))
assert(credential.schema === 'bitlock.credentials/v1', 'Credential schema is missing')
assert(credential.username === 'enzo' && credential.password === password, 'Credential round trip failed')
assert(parsePasswordEntry('legacy-secret').password === 'legacy-secret', 'Legacy password payload is unsupported')

const { generateTotp } = useTotp()
const vector = await generateTotp('otpauth://totp/RFC?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&digits=8&period=30', 59_000)
assert(vector.code === '94287082', `RFC 6238 vector mismatch: ${vector.code}`)

console.log(JSON.stringify({
  ok: true,
  aesGcm: true,
  wrongPasswordRejected: true,
  credentialSchema: true,
  rfc6238: true,
  versionedKdf: true,
  legacyPayloadCompatible: true,
}))
