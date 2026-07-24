/**
 * Named policy packs for the wedge: strict / builder / open.
 */

import { DEFAULT_POLICY, type AgentPolicy } from './policies'

export type PolicyPresetId = 'strict' | 'builder' | 'open'

export interface PolicyPreset {
  id: PolicyPresetId
  label: string
  description: string
  policy: Partial<AgentPolicy>
}

export const POLICY_PRESETS: PolicyPreset[] = [
  {
    id: 'strict',
    label: 'Strict',
    description: 'Confirm new hosts + sensitive clicks; safer demos & enterprise',
    policy: {
      confirmCrossHost: true,
      confirmSensitiveClicks: true,
      pauseOnAskHuman: true,
      maxSteps: 30,
      sensitiveClickPatterns: DEFAULT_POLICY.sensitiveClickPatterns
    }
  },
  {
    id: 'builder',
    label: 'Builder',
    description: 'Default for agent builders — sensitive clicks only',
    policy: {
      confirmCrossHost: false,
      confirmSensitiveClicks: true,
      pauseOnAskHuman: true,
      maxSteps: 40,
      allowHosts: [],
      blockHosts: []
    }
  },
  {
    id: 'open',
    label: 'Open',
    description: 'Minimal gates — fast hacking (use carefully)',
    policy: {
      confirmCrossHost: false,
      confirmSensitiveClicks: false,
      pauseOnAskHuman: true,
      maxSteps: 60
    }
  }
]

