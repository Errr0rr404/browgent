import { useCallback, useEffect, useRef, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import type { AgentSessionStatus } from '@shared/types'
import type { ThemeId } from '../../../themes/themes'
import { useChromePrefs } from '../../../stores/chromePrefs'
import { platformModKey } from '../../../lib/platform'
import { moodFromAgent } from './types'
import './floating-pet.css'

interface Props {
  theme: ThemeId
  agentOpen: boolean
  agentStatus?: AgentSessionStatus
  onToggle: () => void
}

const SIZE = 80
const PAD = 12
const PET_WELCOME_KEY = 'browgent.pet.welcomeDismissed'

/**
 * Floating companion = animated browgent logo (rounded square + wandering orb).
 * Drag to move; click toggles agent; right-click hides.
 */
export function FloatingAgentPet({
  theme: _theme,
  agentOpen,
  agentStatus,
  onToggle
}: Props): React.JSX.Element | null {
  void _theme
  const agentPetVisible = useChromePrefs((s) => s.agentPetVisible)
  const agentPetX = useChromePrefs((s) => s.agentPetX)
  const agentPetY = useChromePrefs((s) => s.agentPetY)
  const setAgentPetVisible = useChromePrefs((s) => s.setAgentPetVisible)
  const setAgentPetPosition = useChromePrefs((s) => s.setAgentPetPosition)

  const [menuOpen, setMenuOpen] = useState(false)
  const [welcomeOpen, setWelcomeOpen] = useState(() => {
    try {
      return localStorage.getItem(PET_WELCOME_KEY) !== '1'
    } catch {
      return true
    }
  })
  const mod = platformModKey()
  const dragRef = useRef<{
    startX: number
    startY: number
    origX: number
    origY: number
    moved: boolean
  } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const mood = moodFromAgent(agentStatus)

  const clampPos = useCallback((x: number, y: number) => {
    const maxX = Math.max(PAD, window.innerWidth - SIZE - PAD)
    const maxY = Math.max(PAD, window.innerHeight - SIZE - PAD)
    return {
      x: Math.round(Math.min(Math.max(PAD, x), maxX)),
      y: Math.round(Math.min(Math.max(PAD, y), maxY))
    }
  }, [])

  const defaultPos = useCallback(() => {
    return clampPos(window.innerWidth - SIZE - 24, window.innerHeight - SIZE - 48)
  }, [clampPos])

  const [pos, setPos] = useState(() => {
    if (agentPetX >= 0 && agentPetY >= 0) return { x: agentPetX, y: agentPetY }
    if (typeof window !== 'undefined') {
      return {
        x: Math.max(PAD, window.innerWidth - SIZE - 24),
        y: Math.max(PAD, window.innerHeight - SIZE - 48)
      }
    }
    return { x: 200, y: 200 }
  })

  useEffect(() => {
    if (agentPetX >= 0 && agentPetY >= 0) {
      setPos(clampPos(agentPetX, agentPetY))
    }
  }, [agentPetX, agentPetY, clampPos])

  useEffect(() => {
    const onResize = (): void => setPos((p) => clampPos(p.x, p.y))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clampPos])

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent): void => {
      if (rootRef.current?.contains(e.target as Node)) return
      setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc, true)
    return () => document.removeEventListener('mousedown', onDoc, true)
  }, [menuOpen])

  if (!agentPetVisible || agentOpen) return null

  const dismissWelcome = (): void => {
    setWelcomeOpen(false)
    try {
      localStorage.setItem(PET_WELCOME_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  const onPointerDown = (e: React.PointerEvent): void => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      moved: false
    }
    setMenuOpen(false)
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true
    setPos(clampPos(d.origX + dx, d.origY + dy))
  }

  const onPointerUp = (e: React.PointerEvent): void => {
    const d = dragRef.current
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    if (!d) return
    if (d.moved) {
      const next = clampPos(d.origX + (e.clientX - d.startX), d.origY + (e.clientY - d.startY))
      setPos(next)
      setAgentPetPosition(next.x, next.y)
      return
    }
    onToggle()
  }

  return (
    <div
      ref={rootRef}
      className={`floating-pet floating-pet--${mood}`}
      style={{ left: pos.x, top: pos.y, width: SIZE, height: SIZE }}
    >
      {welcomeOpen && (
        <div className="floating-pet-welcome" role="status">
          <Sparkles size={14} strokeWidth={1.75} className="floating-pet-welcome-icon" aria-hidden />
          <div className="floating-pet-welcome-copy">
            <strong>Welcome — your agent pet</strong>
            <span>
              This floating mark is your agent companion. Click to chat, drag to move, right-click
              to hide. From New Tab, {mod}↵ also asks the agent.
            </span>
          </div>
          <button
            type="button"
            className="floating-pet-welcome-dismiss"
            aria-label="Dismiss pet welcome"
            onClick={dismissWelcome}
          >
            <X size={12} strokeWidth={2} />
          </button>
          <span className="floating-pet-welcome-arrow" aria-hidden />
        </div>
      )}

      <button
        type="button"
        className="floating-pet-hit"
        aria-label={agentOpen ? 'Close agent panel' : 'Open agent panel'}
        aria-expanded={agentOpen}
        title="Agent companion — drag to move · click to open · right-click to hide"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenuOpen(true)
        }}
      >
        <span className="floating-pet-shadow" aria-hidden />
        {/* Same geometry as BrandMark — rounded square + accent orb */}
        <svg
          className="floating-pet-svg"
          width={56}
          height={56}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <rect
            className="floating-pet-frame"
            x="3"
            y="3"
            width="18"
            height="18"
            rx="5.5"
            stroke="var(--accent)"
            strokeWidth={1.75}
          />
          {/* Orb wanders inside the mark */}
          <g className="floating-pet-orb-wrap">
            <circle className="floating-pet-orb" cx="0" cy="0" r="3" fill="var(--accent-2)" />
          </g>
        </svg>
      </button>

      {menuOpen && (
        <ul className="floating-pet-menu" role="menu">
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false)
                setAgentPetVisible(false)
              }}
            >
              Hide companion
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const p = defaultPos()
                setPos(p)
                setAgentPetPosition(p.x, p.y)
                setMenuOpen(false)
              }}
            >
              Reset position
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
