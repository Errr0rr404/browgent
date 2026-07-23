import { useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Loader2,
  X
} from 'lucide-react'
import type { AgentAction, TrajectoryStep } from '@shared/types'
import { formatMessage } from '../../lib/formatMessage'

/** Collapse assistant/system messages longer than this when prefs say so. */
export const COLLAPSE_CHARS = 280
const ACTION_DETAIL_MAX = 72

export function MessageBubble({
  content,
  collapse
}: {
  content: string
  collapse: boolean
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const long = content.length > COLLAPSE_CHARS || content.split('\n').length > 6
  const shouldCollapse = collapse && long && !expanded
  const display = shouldCollapse ? truncateMessage(content, COLLAPSE_CHARS) : content

  return (
    <div className="msg-bubble">
      {formatMessage(display)}
      {collapse && long && (
        <button
          type="button"
          className="msg-expand"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

function truncateMessage(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastBreak = Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf(' '))
  return `${(lastBreak > max * 0.5 ? cut.slice(0, lastBreak) : cut).trimEnd()}…`
}

export function ActionChip({ action }: { action: AgentAction }): React.JSX.Element {
  const detail =
    action.detail && action.detail.length > ACTION_DETAIL_MAX
      ? `${action.detail.slice(0, ACTION_DETAIL_MAX - 1)}…`
      : action.detail
  return (
    <div className={`action-chip ${action.status}`} title={action.detail || action.label}>
      <ActionIcon status={action.status} />
      <span className="action-chip-text">
        <span className="action-chip-label">{action.label}</span>
        {detail ? <span className="action-chip-detail"> · {detail}</span> : null}
      </span>
    </div>
  )
}

function ActionIcon({ status }: { status: AgentAction['status'] }): React.JSX.Element {
  if (status === 'running' || status === 'waiting') return <Loader2 size={12} className="spin" />
  if (status === 'done') return <Check size={12} />
  if (status === 'error' || status === 'blocked') return <X size={12} />
  return <Circle size={10} />
}

export function TrajectoryRow({
  step,
  collapseLong
}: {
  step: TrajectoryStep
  collapseLong: boolean
}): React.JSX.Element {
  const detail = step.detail ?? ''
  const long = detail.length > 160 || detail.split('\n').length > 3
  const [open, setOpen] = useState(!collapseLong || !long)

  return (
    <div className={`traj-row ${step.kind}${step.ok === false ? ' bad' : ''}`}>
      <div className="traj-meta">
        <span className="traj-kind">{step.tool || step.kind}</span>
        <span>
          {new Date(step.ts).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          })}
        </span>
      </div>
      <div className="traj-title">{step.title}</div>
      {detail &&
        (long && collapseLong ? (
          <>
            <button
              type="button"
              className="traj-toggle"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
            >
              {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {open ? 'Hide detail' : 'Show detail'}
            </button>
            {open && <div className="traj-detail">{detail}</div>}
          </>
        ) : (
          <div className="traj-detail">{detail}</div>
        ))}
    </div>
  )
}
