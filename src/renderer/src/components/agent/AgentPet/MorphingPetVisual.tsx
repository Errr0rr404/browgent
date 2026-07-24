import { useCallback, useEffect, useRef, useState } from 'react'
import type { PetMood } from './types'
import {
  nextPetForm,
  PET_FORM_COMPONENTS,
  PET_FORM_IDS,
  PET_FORM_TINT,
  type PetFormId,
  type PetFormPref
} from './pet-forms'

interface Props {
  formPref: PetFormPref
  mood: PetMood
  /** When true, pause auto-cycle (e.g. while dragging). */
  paused?: boolean
  /** Showcase morph tour on first paint (welcome). */
  celebrate?: boolean
  /** Optional: report active form (for plate tint). */
  onFormChange?: (form: PetFormId) => void
}

const CYCLE_MS = 5600
const MORPH_MS = 700

/**
 * Cross-fading morphing pet: mark ↔ invader ↔ cloud.
 * `cycle` auto-advances; locked forms stay put after a soft settle morph.
 */
export function MorphingPetVisual({
  formPref,
  mood,
  paused = false,
  celebrate = false,
  onFormChange
}: Props): React.JSX.Element {
  const locked = formPref !== 'cycle'
  const [form, setForm] = useState<PetFormId>(
    locked ? (formPref as PetFormId) : 'mark'
  )
  const [prev, setPrev] = useState<PetFormId | null>(null)
  const [morphing, setMorphing] = useState(false)
  const [burst, setBurst] = useState(0)
  const formRef = useRef(form)
  formRef.current = form
  const morphTimer = useRef(0)
  const onFormChangeRef = useRef(onFormChange)
  onFormChangeRef.current = onFormChange

  const morphTo = useCallback((next: PetFormId) => {
    if (next === formRef.current) return
    window.clearTimeout(morphTimer.current)
    setPrev(formRef.current)
    setForm(next)
    formRef.current = next
    setMorphing(true)
    setBurst((n) => n + 1)
    onFormChangeRef.current?.(next)
    morphTimer.current = window.setTimeout(() => {
      setMorphing(false)
      setPrev(null)
    }, MORPH_MS)
  }, [])

  useEffect(() => {
    onFormChangeRef.current?.(form)
  }, [form])

  useEffect(() => {
    return () => window.clearTimeout(morphTimer.current)
  }, [])

  // Sync when user picks a locked form from the menu
  useEffect(() => {
    if (formPref === 'cycle') return
    morphTo(formPref)
  }, [formPref, morphTo])

  // Auto-cycle (paused during welcome celebrate so the tour owns the timeline)
  useEffect(() => {
    if (formPref !== 'cycle' || paused || celebrate) return
    const id = window.setInterval(() => {
      morphTo(nextPetForm(formRef.current))
    }, CYCLE_MS)
    return () => window.clearInterval(id)
  }, [formPref, paused, celebrate, morphTo])

  // Welcome celebrate: quick tour of forms once
  useEffect(() => {
    if (!celebrate || formPref !== 'cycle') return
    let i = 0
    const steps = [...PET_FORM_IDS]
    const tick = (): void => {
      if (i >= steps.length) return
      morphTo(steps[i]!)
      i += 1
    }
    // brief beat on mark, then tour
    const start = window.setTimeout(tick, 280)
    const id = window.setInterval(tick, 980)
    const stop = window.setTimeout(() => window.clearInterval(id), 980 * steps.length + 120)
    return () => {
      window.clearTimeout(start)
      window.clearInterval(id)
      window.clearTimeout(stop)
    }
  }, [celebrate, formPref, morphTo])

  const Active = PET_FORM_COMPONENTS[form]
  const Prev = prev ? PET_FORM_COMPONENTS[prev] : null
  const tint = PET_FORM_TINT[form]

  return (
    <span
      className={`morph-pet morph-pet--${mood} morph-pet--${form}${morphing ? ' morph-pet--morphing' : ''}`}
      style={{ ['--pet-tint' as string]: tint }}
      data-form={form}
    >
      <span className="morph-pet-stack" aria-hidden>
        {Prev && (
          <span key={`prev-${prev}-${burst}`} className="morph-pet-layer morph-pet-layer--out">
            <Prev mood={mood} />
          </span>
        )}
        <span
          key={`cur-${form}-${burst}`}
          className={`morph-pet-layer morph-pet-layer--in${morphing ? '' : ' morph-pet-layer--settled'}`}
        >
          <Active mood={mood} />
        </span>
      </span>
      {morphing && (
        <span className="morph-pet-sparkles" aria-hidden key={`sp-${burst}`}>
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      )}
      <span className="morph-pet-bloom" aria-hidden />
    </span>
  )
}
