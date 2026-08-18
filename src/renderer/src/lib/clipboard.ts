/** Copy text to the clipboard. Returns false if the browser rejected the write. */
export async function copyText(text: string): Promise<boolean> {
  const value = text.trim()
  if (!value) return false
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}
