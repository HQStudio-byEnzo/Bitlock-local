import { createClient } from '@libsql/client'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const dbPath = process.env.DB_PATH || './data/bitlock.db'
const schemaPath = resolve(process.cwd(), 'server/database/schema.sql')
mkdirSync(dirname(resolve(dbPath)), { recursive: true })
const db = createClient({ url: `file:${dbPath}` })

function usernameBase(value, fallback) {
  const normalized = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/[._-]+$/, '')
    .slice(0, 24)
  const safe = normalized.length >= 3 ? normalized : `user_${String(fallback).replace(/[^a-z0-9]/gi, '').slice(0, 8)}`
  return safe.slice(0, 24)
}

async function migrateUsernames() {
  const info = await db.execute({ sql: "PRAGMA table_info('users')" })
  if (!info.rows.some(row => String(row.name) === 'username')) {
    await db.execute({ sql: 'ALTER TABLE users ADD COLUMN username TEXT' })
  }

  const users = await db.execute({ sql: 'SELECT id, name, email, username FROM users ORDER BY created_at, id' })
  const used = new Set()
  for (const row of users.rows) {
    const original = typeof row.username === 'string' ? row.username.toLowerCase() : ''
    let candidate = /^[a-z0-9][a-z0-9._-]{2,31}$/.test(original) && !used.has(original)
      ? original
      : usernameBase(row.name || String(row.email || '').split('@')[0], row.id)
    let suffix = 2
    while (used.has(candidate)) {
      const marker = `_${suffix++}`
      candidate = `${usernameBase(row.name || String(row.email || '').split('@')[0], row.id).slice(0, 32 - marker.length)}${marker}`
    }
    used.add(candidate)
    await db.execute({
      sql: 'UPDATE users SET username = ?, email = ? WHERE id = ?',
      args: [candidate, `${row.id}@local.invalid`, row.id],
    })
  }
  await db.execute({ sql: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)' })
}

try {
  // Upgrade the central table before applying indexes from schema.sql. This runs
  // before Nuxt starts and keeps existing local databases bootable.
  await db.execute({ sql: `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, password_hint TEXT, session_version INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))` })
  await migrateUsernames()
  await db.execute({ sql: `CREATE TABLE IF NOT EXISTS vaults (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#4ade80', is_default INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), UNIQUE(user_id, name), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)` })
  await db.execute({ sql: `CREATE TABLE IF NOT EXISTS folders (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, vault_id TEXT NOT NULL, name TEXT NOT NULL, parent_id TEXT, created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE, FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE SET NULL)` })
  await db.execute({ sql: `CREATE TABLE IF NOT EXISTS extension_tokens (user_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now')), last_used_at TEXT, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)` })

  const itemInfo = await db.execute({ sql: "PRAGMA table_info('vault_items')" })
  if (itemInfo.rows.length) {
    const columns = new Set(itemInfo.rows.map(row => String(row.name || '')))
    const definition = await db.execute({ sql: "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'vault_items'" })
    const tableSql = String(definition.rows[0]?.sql || '')
    const current = columns.has('vault_id') && columns.has('folder_id') && tableSql.includes("'note'") && tableSql.includes("'totp'")
    if (!current) {
      const desired = ['id', 'user_id', 'vault_id', 'folder_id', 'type', 'label', 'is_encrypted', 'payload', 'iv', 'url', 'favorite', 'created_at', 'updated_at']
      const select = desired.map(column => {
        if (columns.has(column)) return column
        if (['vault_id', 'folder_id', 'url'].includes(column)) return `NULL AS ${column}`
        if (column === 'favorite') return '0 AS favorite'
        if (column === 'created_at' || column === 'updated_at') return `datetime('now') AS ${column}`
        return column
      })
      await db.execute({ sql: 'BEGIN IMMEDIATE' })
      try {
        await db.execute({ sql: 'DROP TABLE IF EXISTS vault_items_migrated' })
        await db.execute({ sql: `CREATE TABLE vault_items_migrated (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, vault_id TEXT, folder_id TEXT, type TEXT NOT NULL CHECK (type IN ('link', 'password', 'crypto', 'recovery', 'note', 'totp')), label TEXT NOT NULL DEFAULT '', is_encrypted INTEGER NOT NULL DEFAULT 0, payload TEXT NOT NULL, iv TEXT, url TEXT, favorite INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE, FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL)` })
        await db.execute({ sql: `INSERT INTO vault_items_migrated (${desired.join(', ')}) SELECT ${select.join(', ')} FROM vault_items` })
        await db.execute({ sql: 'DROP TABLE vault_items' })
        await db.execute({ sql: 'ALTER TABLE vault_items_migrated RENAME TO vault_items' })
        await db.execute({ sql: 'COMMIT' })
      } catch (error) {
        await db.execute({ sql: 'ROLLBACK' }).catch(() => {})
        throw error
      }
    }
  }

  const statements = readFileSync(schemaPath, 'utf8')
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean)

  await db.batch(statements.map(sql => ({ sql })), 'write')
  await db.execute({ sql: `INSERT OR IGNORE INTO vaults (id, user_id, name, color, is_default) SELECT 'default-' || id, id, 'Principal', '#4ade80', 1 FROM users` })
  await db.execute({ sql: `UPDATE vault_items SET vault_id = 'default-' || user_id WHERE vault_id IS NULL` })
  console.log(`Database initialized at ${dbPath}`)
} finally {
  await db.close()
}
