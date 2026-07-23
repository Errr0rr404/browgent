import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { AgentSessionState } from '@shared/types'
import type { ThemeId } from '../../../themes/themes'
import { useChromePrefs } from '../../../stores/chromePrefs'
import { PET_SKINS } from './registry'
import { moodFromAgent, type PetMode } from './types'
import './agent-pet.css'

interface Props {
  theme: ThemeId
  mode: PetMode
  agentOpen: boolean
  agentStatus?: AgentSessionState['status']
  onToggle: () => void
  /** companion ~80, dock ~52 */
  size?: number
  className?: string
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (): void => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

export function AgentPet({
  theme,
  mode,
  agentOpen,
  agentStatus,
  onToggle,
  size: sizeProp,
  className = ''
}: Props): React.JSX.Element {
  const setAgentPetVisible = useChromePrefs((s) => s.setAgentPetVisible)
  const reducedMotion = usePrefersReducedMotion()
  const mood = moodFromAgent(agentStatus)
  const size = sizeProp ?? (mode === 'companion' ? 80 : 52)
  const Skin = PET_SKINS[theme] ?? PET_SKINS.eink
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const closeMenu = useCallback(() => setMenuOpen(false), [])

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent): void => {
      if (rootRef.current?.contains(e.target as Node)) return
      closeMenu()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeMenu()
    }
    document.addEventListener('mousedown', onDoc, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen, closeMenu])

  const hide = (): void => {
    setAgentPetVisible(false)
    closeMenu()
  }

  return (
    <div
      className={`agent-pet-wrap agent-pet-wrap--${mode} ${className}`.trim()}
      ref={rootRef}
    >
      <button
        type="button"
        className={`agent-pet agent-pet--${mode} agent-pet--${mood}${agentOpen ? ' agent-pet--open' : ''}`}
        aria-label={agentOpen ? 'Close agent panel' : 'Open agent panel'}
        aria-expanded={agentOpen}
        title={agentOpen ? 'Close agent (⌘J)' : 'Open agent (⌘J) · right-click to hide'}
        onClick={() => {
          closeMenu()
          onToggle()
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenuOpen(true)
        }}
      >
        <span className="agent-pet-visual">
          <Skin mood={mood} size={size} reducedMotion={reducedMotion} />
        </span>
      </button>

      {menuOpen && (
        <ul
          className="agent-pet-menu"
          id={menuId}
          role="menu"
          data-placement={mode === 'dock' ? 'above' : 'below'}
        >
          <li role="none">
            <button type="button" role="menuitem" onClick={hide}>
              Hide companion
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
