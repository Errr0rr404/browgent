/**
 * Read-only SQLite helpers via sql.js (no native rebuild).
 * Always copy locked Chromium DBs to a temp file first.
 *
 * Uses the asm.js build so packaged Electron apps do not need a separate
 * .wasm file resolved from asar/node_modules at runtime.
 */
import { chmodSync, copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const initSqlJs = require('sql.js/dist/sql-asm.js') as (
  cfg?: object
) => Promise<import('sql.js').SqlJsStatic>
import type { Database, SqlJsStatic } from 'sql.js'

let sqlPromise: Promise<SqlJsStatic> | null = null

async function getSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs()
  }
  return sqlPromise
}

export async function openCopiedSqlite(dbPath: string): Promise<{
  db: Database
  cleanup: () => void
} | null> {
  if (!existsSync(dbPath)) return null
  const dir = mkdtempSync(join(tmpdir(), 'browgent-import-'))
  const dest = join(dir, 'db.sqlite')
  try {
    // Copy main DB only. sql.js does not replay WAL — quit source browser for full fidelity.
    copyFileSync(dbPath, dest)
    try {
      chmodSync(dest, 0o600)
    } catch {
      /* best-effort on platforms that ignore mode */
    }
    const SQL = await getSql()
    const file = readFileSync(dest)
    const db = new SQL.Database(file)
    return {
      db,
      cleanup: () => {
        try {
          db.close()
        } catch {
          /* */
        }
        try {
          rmSync(dir, { recursive: true, force: true })
        } catch {
          /* */
        }
      }
    }
  } catch (e) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* */
    }
    console.warn('[import] sqlite open failed', dbPath, e)
    return null
  }
}

export function queryAll(
  db: Database,
  sql: string
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = []
  const stmt = db.prepare(sql)
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as Record<string, unknown>)
  }
  stmt.free()
  return rows
}

/** Chrome time: microseconds since 1601-01-01 UTC → Unix ms */
export function chromeTimeToUnixMs(chromeTime: number): number {
  if (!Number.isFinite(chromeTime) || chromeTime <= 0) return Date.now()
  return Math.floor(chromeTime / 1000 - 11_644_473_600_000)
}
