import { useEffect, useState, type KeyboardEvent } from 'react'
import type { AgentSessionState } from '@shared/types'
import { DEFAULT_POLICY, type AgentPolicy } from '@shared/policies'

interface Props {
  state: AgentSessionState | null
  onOpenSettings?: () => void
}

export function PolicyPane({ state, onOpenSettings }: Props): React.JSX.Element {
  const p = state?.policy
  const policy: AgentPolicy = p ?? DEFAULT_POLICY
  const [maxStepsDraft, setMaxStepsDraft] = useState(String(policy.maxSteps))
  const [committedMaxSteps, setCommittedMaxSteps] = useState(policy.maxSteps)
  const [driverMode, setDriverMode] = useState<'dom' | 'cdp'>('dom')
  const [cdpNote, setCdpNote] = useState('')

  useEffect(() => {
    if (policy.maxSteps !== committedMaxSteps) {
      setCommittedMaxSteps(policy.maxSteps)
      setMaxStepsDraft(String(policy.maxSteps))
    }
  }, [policy.maxSteps, committedMaxSteps])

  useEffect(() => {
    if (!window.browgent?.getDriverStatus) return
    void window.browgent.getDriverStatus().then((s) => {
      setDriverMode(s.driverMode)
      setCdpNote(s.note)
    })
  }, [])

  const commitMaxSteps = (): void => {
    let n = Number(maxStepsDraft)
    if (!Number.isFinite(n)) n = committedMaxSteps
    n = Math.min(100, Math.max(5, Math.round(n)))
    if (n !== committedMaxSteps) {
      setCommittedMaxSteps(n)
      setMaxStepsDraft(String(n))
      if (n !== policy.maxSteps) {
        void window.browgent.setAgentPolicy({ maxSteps: n })
      }
    } else {
      setMaxStepsDraft(String(n))
    }
  }

  const onMaxStepsKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitMaxSteps()
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setMaxStepsDraft(String(committedMaxSteps))
      e.currentTarget.blur()
    }
  }

  return (
    <>
      <p className="empty-hint">
        Safety gates for this session. Host allow/block lists and console display live in Settings.
      </p>

      <label className="policy-row">
        <span>Max steps</span>
        <input
          type="number"
          min={5}
          max={100}
          value={maxStepsDraft}
          onChange={(e) => setMaxStepsDraft(e.target.value)}
          onBlur={commitMaxSteps}
          onKeyDown={onMaxStepsKey}
          aria-valuemin={5}
          aria-valuemax={100}
          aria-valuenow={committedMaxSteps}
        />
      </label>

      <label className="policy-row check">
        <input
          type="checkbox"
          checked={policy.confirmSensitiveClicks}
          onChange={(e) =>
            void window.browgent.setAgentPolicy({ confirmSensitiveClicks: e.target.checked })
          }
        />
        <span>Confirm sensitive clicks</span>
      </label>
      <label className="policy-row check">
        <input
          type="checkbox"
          checked={policy.confirmCrossHost}
          onChange={(e) =>
            void window.browgent.setAgentPolicy({ confirmCrossHost: e.target.checked })
          }
        />
        <span>Confirm new hosts</span>
      </label>
      <label className="policy-row check">
        <input
          type="checkbox"
          checked={policy.pauseOnAskHuman}
          onChange={(e) =>
            void window.browgent.setAgentPolicy({ pauseOnAskHuman: e.target.checked })
          }
        />
        <span>Pause on ask-human</span>
      </label>

      <label className="policy-row">
        <span>In-app driver</span>
        <select
          value={driverMode}
          onChange={(e) => {
            const mode = e.target.value === 'cdp' ? 'cdp' : 'dom'
            void window.browgent.setDriverMode(mode).then((m) => {
              setDriverMode(m)
              void window.browgent.getDriverStatus().then((s) => setCdpNote(s.note))
            })
          }}
          title={cdpNote || 'DOM inject or CDP input events'}
        >
          <option value="dom">DOM (fast)</option>
          <option value="cdp">CDP (real events)</option>
        </select>
      </label>

      {onOpenSettings && (
        <button type="button" className="ctrl-btn accent" onClick={onOpenSettings}>
          Open full agent settings →
        </button>
      )}
    </>
  )
}
