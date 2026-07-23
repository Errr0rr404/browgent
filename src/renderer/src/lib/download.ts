/** Trigger a browser download of a text/blob payload. */
export function downloadTextFile(
  content: string,
  filename: string,
  mime = 'application/json'
): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export async function exportTrajectoryFile(): Promise<void> {
  const json = await window.browgent.exportTrajectory()
  downloadTextFile(json, `browgent-trajectory-${Date.now()}.json`)
}
