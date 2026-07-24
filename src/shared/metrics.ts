/** Privacy-safe local metrics — never includes page content, URLs, or prompts. */

export interface LocalMetrics {
  installId: string
  createdAt: string
  version: string
  platform: string
  telemetryOptIn: boolean
  agentRunCount: number
  mcpCallCount: number
  trajectoryExportCount: number
  appLaunchCount: number
  /** One-click / scripted hero demos completed */
  demoRunCount: number
  /** Recipe chip or first-run recipe starts */
  recipeRunCount: number
  lastLaunchAt: string | null
  lastAgentRunAt: string | null
  lastMcpCallAt: string | null
  lastDemoAt: string | null
}

/** Snapshot safe to paste into a YC application or investor update. */
export interface TractionPacket {
  schemaVersion: 1
  format: 'browgent.traction'
  generatedAt: string
  product: {
    name: 'Browgent'
    oneLiner: string
    version: string
    repo: string
  }
  metrics: LocalMetrics
  derived: {
    daysSinceInstall: number
    agentRunsPerLaunch: number
    mcpShareOfActivity: number
  }
  notes: string[]
}
