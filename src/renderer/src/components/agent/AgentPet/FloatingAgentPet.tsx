import { useCallback, useEffect, useRef, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import type { AgentSessionStatus } from '@shared/types'
import type { ThemeId } from '../../../themes/themes'
import { useChromePrefs } from '../../../stores/chromePrefs'
import { platformModKey } from '../../../lib/platform'
import { MorphingPetVisual } from './MorphingPetVisual'
import {
  PET_FORM_IDS,
  PET_FORM_LABELS,
  PET_FORM_TINT,
  type PetFormId,
  type PetFormPref
} from './pet-forms'
import { moodFromAgent } from './types'
import './floating-pet.css'

interface Props {
  theme: ThemeId
  agentOpen: boolean
  agentStatus?: AgentSessionStatus
  onToggle: () => void
}

const SIZE = 84
const PAD = 12
const PET_WELCOME_KEY = 'browgent.pet.welcomeDismissed'

/**
 * Floating companion — morphing mark / invader / cloud bot.
 * Drag to move; click toggles agent; right-click for hide + form picker.
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
  const agentPetForm = useChromePrefs((s) => s.agentPetForm)
  const setAgentPetVisible = useChromePrefs((s) => s.setAgentPetVisible)
  const setAgentPetPosition = useChromePrefs((s) => s.setAgentPetPosition)
  const setAgentPetForm = useChromePrefs((s) => s.setAgentPetForm)

  const [menuOpen, setMenuOpen] = useState(false)
  const [welcomeOpen, setWelcomeOpen] = useState(() => {
    try {
      return localStorage.getItem(PET_WELCOME_KEY) !== '1'
    } catch {
      return true
    }
  })
  const [dragging, setDragging] = useState(false)
  const [activeForm, setActiveForm] = useState<PetFormId>(
    agentPetForm === 'cycle' ? 'mark' : agentPetForm
  )
  const [pressed, setPressed] = useState(false)
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
  const formPref: PetFormPref = agentPetForm

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
    setDragging(true)
    setPressed(true)
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
    setDragging(false)
    setPressed(false)
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
    dismissWelcome()
    onToggle()
  }

  const pickForm = (pref: PetFormPref): void => {
    setAgentPetForm(pref)
    setMenuOpen(false)
  }

  return (
    <div
      ref={rootRef}
      className={`floating-pet floating-pet--${mood} floating-pet--form-${activeForm}${dragging ? ' floating-pet--dragging' : ''}${pressed ? ' floating-pet--pressed' : ''}${welcomeOpen ? ' floating-pet--welcome' : ''}`}
      style={{
        left: pos.x,
        top: pos.y,
        width: SIZE,
        height: SIZE,
        ['--pet-tint' as string]: PET_FORM_TINT[activeForm]
      }}
      data-form={activeForm}
    >
      {welcomeOpen && (
        <div className="floating-pet-welcome" role="status">
          <div className="floating-pet-welcome-glow" aria-hidden />
          <Sparkles size={14} strokeWidth={1.75} className="floating-pet-welcome-icon" aria-hidden />
          <div className="floating-pet-welcome-copy">
            <strong>Meet your morphing pet</strong>
            <span>
              Click to chat, drag to move, right-click to switch forms (mark → invader → cloud).
              From New Tab, {mod}↵ asks the agent.
            </span>
            <div className="floating-pet-welcome-dots" aria-hidden>
              {PET_FORM_IDS.map((id) => (
                <span key={id} className={`floating-pet-welcome-dot floating-pet-welcome-dot--${id}`} />
              ))}
            </div>
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
        title="Agent companion — drag · click to open · right-click for forms"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenuOpen(true)
        }}
      >
        <span className="floating-pet-shadow" aria-hidden />
        <span className="floating-pet-ring" aria-hidden />
        <MorphingPetVisual
          formPref={formPref}
          mood={mood}
          paused={dragging || menuOpen}
          celebrate={welcomeOpen}
          onFormChange={setActiveForm}
        />
      </button>

      {menuOpen && (
        <ul className="floating-pet-menu" role="menu">
          <li className="floating-pet-menu-label" role="presentation">
            Form
          </li>
          {(['cycle', ...PET_FORM_IDS] as PetFormPref[]).map((id) => (
            <li key={id} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={formPref === id}
                className={formPref === id ? 'is-active' : undefined}
                onClick={() => pickForm(id)}
              >
                {PET_FORM_LABELS[id]}
              </button>
            </li>
          ))}
          <li className="floating-pet-menu-sep" role="separator" />
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
        </ul>
      )}
    </div>
  )
}
