const API = 'http://localhost:3000'
const tokenInput = document.querySelector('#token')
const masterInput = document.querySelector('#master')
const status = document.querySelector('#status')
const accounts = document.querySelector('#accounts')
let currentTab

function bytes(value) {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0))
}

async function decryptItem(item, password) {
  const [salt, ciphertext] = item.payload.split(':')
  if (!salt || !ciphertext || !item.iv) throw new Error('FORMAT')
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: bytes(salt), iterations: 100000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(item.iv) }, key, bytes(ciphertext))
  return new TextDecoder().decode(plain)
}

function parseEntry(value) {
  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed.password === 'string') return parsed
  } catch {}
  return { password: value, username: '', email: '' }
}

async function fill(entry) {
  await chrome.scripting.executeScript({
    target: { tabId: currentTab.id },
    func: (data) => {
      const password = document.querySelector('input[type="password"]')
      const user = document.querySelector('input[autocomplete="username"],input[type="email"],input[name*="user" i],input[name*="login" i]')
      const set = (element, value) => {
        if (!element || !value) return
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        setter?.call(element, value)
        element.dispatchEvent(new Event('input', { bubbles: true }))
        element.dispatchEvent(new Event('change', { bubbles: true }))
      }
      set(user, data.username || data.email)
      set(password, data.password)
      password?.focus()
    },
    args: [entry],
  })
  window.close()
}

async function load() {
  const token = tokenInput.value.trim()
  const password = masterInput.value
  if (!token || !password) {
    status.textContent = 'Jeton local et mot de passe maître requis.'
    return
  }

  status.textContent = 'Déchiffrement local…'
  accounts.replaceChildren()
  try {
    await chrome.storage.local.set({ bridgeToken: token })
    const response = await fetch(`${API}/api/extension/passwords`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(response.status === 401 ? 'AUTH' : 'API')
    const host = new URL(currentTab.url).hostname
    const { items } = await response.json()
    const normalizedHost = host.replace(/^www\./, '')
    const matching = items.filter((item) => {
      try {
        return item.url && new URL(item.url).hostname.replace(/^www\./, '') === normalizedHost
      } catch {
        return false
      }
    })
    if (!matching.length) {
      status.textContent = 'Aucun identifiant pour ce domaine.'
      return
    }
    for (const item of matching) {
      const entry = parseEntry(await decryptItem(item, password))
      const button = document.createElement('button')
      const title = document.createElement('b')
      const subtitle = document.createElement('span')
      button.className = 'account'
      title.textContent = item.label || host
      subtitle.textContent = entry.username || entry.email || 'Compte enregistré'
      button.append(title, subtitle)
      button.addEventListener('click', () => fill(entry))
      accounts.append(button)
    }
    masterInput.value = ''
    status.textContent = `${matching.length} compte(s) trouvé(s).`
  } catch (error) {
    status.textContent = error.message === 'AUTH'
      ? 'Jeton invalide. Générez-en un nouveau dans les paramètres BitLock.'
      : 'Mot de passe incorrect ou serveur local indisponible.'
  }
}

chrome.storage.local.get('bridgeToken').then(({ bridgeToken }) => {
  if (typeof bridgeToken === 'string') tokenInput.value = bridgeToken
})
chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  currentTab = tab
  try {
    document.querySelector('#origin').textContent = `SITE / ${new URL(tab.url).hostname}`
  } catch {}
})
document.querySelector('#load').addEventListener('click', load)
masterInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') load()
})
