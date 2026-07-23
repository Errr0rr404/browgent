/** Parse a comma-separated host list for agent allow/block policy. */
export function parseHosts(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/^www\./, ''))
    .filter(Boolean)
}
