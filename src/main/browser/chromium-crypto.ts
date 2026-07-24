/**
 * Decrypt Chromium "v10"/"v11" password blobs using OS keychain Safe Storage secret.
 * macOS: `security find-generic-password`
 * Linux: best-effort plaintext/keyring (often fails — passwords skipped with warning)
 * Windows: DPAPI not implemented in this pass — passwords skipped with warning
 */
import { createDecipheriv, pbkdf2Sync } from 'crypto'
import { execFileSync } from 'child_process'
import type { BrowserId } from '../../shared/import-types'
import { chromiumKeychainAccount } from './browser-detect'

const KEYCHAIN_CACHE = new Map<string, string>()

function readMacSafeStoragePassword(service: string, account: string): string | null {
  const cacheKey = `${service}::${account}`
  if (KEYCHAIN_CACHE.has(cacheKey)) return KEYCHAIN_CACHE.get(cacheKey)!
  try {
    const out = execFileSync(
      'security',
      ['find-generic-password', '-w', '-s', service, '-a', account],
      {
        encoding: 'utf8',
        timeout: 15_000,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    )
    const secret = out.trim()
    if (secret) {
      KEYCHAIN_CACHE.set(cacheKey, secret)
      return secret
    }
  } catch (e) {
    console.warn('[import] keychain read failed', service, e)
  }
  return null
}

function deriveKey(safeStoragePassword: string): Buffer {
  // Chromium: macOS uses 1003 iterations; Linux uses 1 (os_crypt_linux.cc).
  const iterations = process.platform === 'linux' ? 1 : 1003
  return pbkdf2Sync(safeStoragePassword, 'saltysalt', iterations, 16, 'sha1')
}

export function decryptChromiumPassword(
  browserId: BrowserId,
  passwordValue: Buffer | Uint8Array | string | null
): string | null {
  if (passwordValue == null) return null
  const buf =
    typeof passwordValue === 'string'
      ? Buffer.from(passwordValue, 'utf8')
      : Buffer.from(passwordValue)
  if (buf.length < 4) return null

  // Unencrypted legacy (rare)
  const prefix = buf.subarray(0, 3).toString('utf8')
  if (prefix !== 'v10' && prefix !== 'v11') {
    // May already be plain
    const plain = buf.toString('utf8')
    if (plain && !/[\x00-\x08]/.test(plain)) return plain
    return null
  }

  if (process.platform === 'win32') {
    // Windows DPAPI requires native binding — skip with null
    return null
  }

  const account = chromiumKeychainAccount(browserId)
  if (!account) return null

  let secret: string | null = null
  if (process.platform === 'darwin') {
    secret = readMacSafeStoragePassword(account.service, account.account)
  } else if (process.platform === 'linux') {
    // Chromium builds register different libsecret application attributes.
    const apps =
      browserId === 'chrome'
        ? ['chrome', 'chromium']
        : browserId === 'edge'
          ? ['microsoft-edge', 'edge']
          : browserId === 'brave'
            ? ['brave-browser', 'brave']
            : browserId === 'arc'
              ? ['arc', 'chrome']
              : [browserId, 'chrome']
    for (const app of apps) {
      try {
        const out = execFileSync('secret-tool', ['lookup', 'application', app], {
          encoding: 'utf8',
          timeout: 5000
        }).trim()
        if (out) {
          secret = out
          break
        }
      } catch {
        /* try next */
      }
    }
    // Historical default on some Linux Chromium builds when no keyring is used
    if (!secret) secret = 'peanuts'
  }

  if (!secret) return null

  try {
    const key = deriveKey(secret)
    const iv = Buffer.alloc(16, ' ')
    const ciphertext = buf.subarray(3)
    const decipher = createDecipheriv('aes-128-cbc', key, iv)
    decipher.setAutoPadding(true)
    const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return dec.toString('utf8')
  } catch {
    return null
  }
}
