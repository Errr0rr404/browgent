import type { AgentSessionState } from '@shared/types'
import type { ThemeId } from '../../../themes/themes'

export type PetMood = 'idle' | 'busy' | 'attention'

export type PetMode = 'companion' | 'dock'

export interface PetSkinProps {
  mood: PetMood
  size: number
  reducedMotion: boolean
}

export function moodFromAgent(status: AgentSessionState['status'] | undefined): PetMood {
  if (!status || status === 'idle') return 'idle'
  if (status === 'waiting_human' || status === 'error') return 'attention'
  // thinking | acting | paused
  return 'busy'
}

export type PetSkinId = ThemeId
