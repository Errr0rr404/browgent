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

type SpeechRec = {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null
  onerror: ((ev: { error: string }) => void) | null
  onend: (() => void) | null
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: ArrayLike<{
    isFinal: boolean
    0: { transcript: string }
  }>
}

function getSpeechRecognitionCtor(): (new () => SpeechRec) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRec
    webkitSpeechRecognition?: new () => SpeechRec
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function useVoiceInput(opts: {
  onFinal: (text: string) => void
  onInterim?: (text: string) => void
  lang?: string
}): VoiceInputState {
  const [engine, setEngine] = useState<VoiceEngine>('none')
  const [status, setStatus] = useState<VoiceStatus>('idle')
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<SpeechRec | null>(null)
  const wantListen = useRef(false)
  const committedRef = useRef('')
  const onFinalRef = useRef(opts.onFinal)
  const onInterimRef = useRef(opts.onInterim)
  onFinalRef.current = opts.onFinal
  onInterimRef.current = opts.onInterim

  useEffect(() => {
    setEngine(getSpeechRecognitionCtor() ? 'webspeech' : 'none')
  }, [])

  const stop = useCallback(() => {
    wantListen.current = false
    try {
      recRef.current?.stop()
    } catch {
      /* ignore */
    }
    recRef.current = null
    setStatus('idle')
    setInterim('')
  }, [])

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      setEngine('none')
      setError('Speech recognition unavailable in this build of Electron')
      setStatus('error')
      return
    }

    wantListen.current = true
    committedRef.current = ''
    setError(null)
    setInterim('')
    setEngine('webspeech')

    try {
      recRef.current?.abort()
    } catch {
      /* ignore */
    }

    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = opts.lang ?? 'en-US'
    rec.maxAlternatives = 1

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
      wantListen.current = false
    }

    rec.onend = () => {
      // Chrome ends sessions after silence — restart while user still wants mic on
      if (wantListen.current) {
        try {
          rec.start()
          return
        } catch {
          /* fall through */
        }
      }
      setStatus('idle')
      setInterim('')
    }

    recRef.current = rec
    try {
      rec.start()
      setStatus('listening')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start mic')
      setStatus('error')
      wantListen.current = false
    }
  }, [opts.lang])

  const toggle = useCallback(() => {
    if (status === 'listening') stop()
    else start()
  }, [status, start, stop])

  useEffect(() => {
    return () => {
      wantListen.current = false
      try {
        recRef.current?.abort()
      } catch {
        /* ignore */
      }
    }
  }, [])

  return {
    supported: engine !== 'none' || Boolean(getSpeechRecognitionCtor()),
    engine,
    status,
    interim,
    error,
    start,
    stop,
    toggle
  }
}
