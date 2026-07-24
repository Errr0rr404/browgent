import type { AgentSessionState } from '@shared/types'

export type PetMood = 'idle' | 'busy' | 'attention'

export function moodFromAgent(status: AgentSessionState['status'] | undefined): PetMood {
  if (!status || status === 'idle') return 'idle'
  if (status === 'waiting_human' || status === 'error') return 'attention'
  // thinking | acting | paused
  return 'busy'
}
