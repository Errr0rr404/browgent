/**
 * Voice → text for agent instructions.
 *
 * Uses Chromium Web Speech API (webkitSpeechRecognition) — the fastest
 * interactive path in Electron. On macOS this typically routes through the
 * system speech engine (on-device when the OS supports it).
 *
 * Click the mic to toggle continuous listening with interim results.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export type VoiceEngine = 'webspeech' | 'none'
export type VoiceStatus = 'idle' | 'listening' | 'error'

export interface VoiceInputState {
  supported: boolean
  engine: VoiceEngine
  status: VoiceStatus
  interim: string
  error: string | null
  start: () => void
  stop: () => void
  toggle: () => void
}

type Ctor = new () => SpeechRecognition

function getSpeechRecognitionCtor(): Ctor | null {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

export function useVoiceInput(opts: {
  onFinal: (text: string) => void
  onInterim?: (text: string) => void
  lang?: string
}): VoiceInputState {
  const initialSupported = (() => {
    try {
      return Boolean(getSpeechRecognitionCtor())
    } catch {
      return false
    }
  })()
  const [engine, setEngine] = useState<VoiceEngine>(initialSupported ? 'webspeech' : 'none')
  const [status, setStatus] = useState<VoiceStatus>('idle')
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [supported, setSupported] = useState(initialSupported)
  const recRef = useRef<SpeechRecognition | null>(null)
  const wantListen = useRef(false)
  const startingRef = useRef(false)
  const committedRef = useRef('')
  // Set by onerror; read by onend so a surfaced 'error' status is not reset to 'idle'.
  const erroredRef = useRef(false)
  const onFinalRef = useRef(opts.onFinal)
  const onInterimRef = useRef(opts.onInterim)
  onFinalRef.current = opts.onFinal
  onInterimRef.current = opts.onInterim

  useEffect(() => {
    const ctor = getSpeechRecognitionCtor()
    setSupported(Boolean(ctor))
    setEngine(ctor ? 'webspeech' : 'none')
  }, [])

  const stop = useCallback(() => {
    wantListen.current = false
    startingRef.current = false
    erroredRef.current = false
    try {
      recRef.current?.abort()
    } catch {
      /* ignore */
    }
    recRef.current = null
    setStatus('idle')
    setInterim('')
  }, [])

  const start = useCallback(() => {
    if (startingRef.current) return
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      setSupported(false)
      setEngine('none')
      setError('Speech recognition unavailable in this Electron build')
      setStatus('error')
      return
    }
    startingRef.current = true
    wantListen.current = true
    committedRef.current = ''
    erroredRef.current = false
    setError(null)
    setInterim('')
    setEngine('webspeech')
    setSupported(true)

    try {
      recRef.current?.abort()
    } catch {
      /* ignore */
    }

    const rec = new Ctor()

    rec.onresult = (ev) => {
      let interimText = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i]
        const t = (r[0]?.transcript ?? '').trim()
        if (!t) continue
        if (r.isFinal) {
          committedRef.current = `${committedRef.current} ${t}`.trim()
          onFinalRef.current(committedRef.current)
          setInterim('')
        } else {
          interimText += (interimText ? ' ' : '') + t
        }
      }
      if (interimText) {
        const display = `${committedRef.current} ${interimText}`.trim()
        setInterim(display)
        onInterimRef.current?.(display)
      }
    }

    rec.onerror = (ev) => {
      if (ev.error === 'aborted' || ev.error === 'no-speech') return
      const msg =
        ev.error === 'not-allowed'
          ? 'Microphone permission denied — allow mic for Browgent'
          : ev.error === 'network'
            ? 'Speech service unreachable — check network / OS speech settings'
            : `Speech error: ${ev.error}`
      setError(msg)
      setStatus('error')
      erroredRef.current = true
      wantListen.current = false
      startingRef.current = false
    }

    rec.onend = () => {
      startingRef.current = false
      recRef.current = null
      if (wantListen.current) {
        try {
          rec.start()
          recRef.current = rec
          startingRef.current = true
          return
        } catch {
          wantListen.current = false
        }
      }
      // Web Speech fires onend right after onerror — don't clobber the 'error' status
      // back to 'idle', or the error is never observable to the UI.
      if (erroredRef.current) return
      setStatus('idle')
      setInterim('')
    }

    rec.continuous = true
    rec.interimResults = true
    rec.lang = opts.lang ?? 'en-US'
    rec.maxAlternatives = 1

    recRef.current = rec
    try {
      rec.start()
      setStatus('listening')
    } catch (e) {
      startingRef.current = false
      setError(e instanceof Error ? e.message : 'Could not start mic')
      setStatus('error')
      wantListen.current = false
      recRef.current = null
    }
  }, [opts.lang])

  const toggle = useCallback(() => {
    if (status === 'listening') stop()
    else start()
  }, [status, start, stop])

  useEffect(() => {
    return () => {
      wantListen.current = false
      startingRef.current = false
      try {
        recRef.current?.abort()
      } catch {
        /* ignore */
      }
    }
  }, [])

  return {
    supported,
    engine,
    status,
    interim,
    error,
    start,
    stop,
    toggle
  }
}
