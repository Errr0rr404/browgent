import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

/** Load `.env` into process.env without overriding existing vars. */
export function loadEnvFile(): void {
  const candidates = [
    join(process.cwd(), '.env'),
    join(app.getAppPath(), '.env'),
    join(app.getPath('userData'), '.env')
  ]

  for (const file of candidates) {
    if (!existsSync(file)) continue
    try {
      const text = readFileSync(file, 'utf8')
      for (const rawLine of text.split(/\r?\n/)) {
        // Allow end-of-line comments: KEY=value # comment (only when unquoted)
        let line = rawLine.trim()
        if (!line || line.startsWith('#')) continue
        const eq = line.indexOf('=')
        if (eq <= 0) continue
        const key = line.slice(0, eq).trim()
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
        let val = line.slice(eq + 1).trim()
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1)
        } else {
          // Strip unquoted trailing comments
          const hash = val.indexOf(' #')
          if (hash >= 0) val = val.slice(0, hash).trim()
        }
        // Unescape common sequences in quoted values
        val = val.replace(/\\n/g, '\n').replace(/\\t/g, '\t')
        if (key && process.env[key] === undefined) {
          process.env[key] = val
        }
      }
      break
    } catch {
      // try next path
    }
  }
}
