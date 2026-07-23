/** Display labels for agent brain providers (UI only). */
export const PROVIDER_LABELS: Record<string, string> = {
  grok: 'Grok',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  groq: 'Groq',
  deepseek: 'DeepSeek',
  ollama: 'Ollama',
  custom: 'Custom',
  heuristic: 'Heuristic'
}

export function providerLabel(id: string): string {
  return PROVIDER_LABELS[id] ?? id
}
