/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

export interface TimerState {
  id: string              // "recipeId:stepIndex"
  recipeId: string
  recipeTitle: string
  stepIndex: number
  stepLabel: string       // ≤30 chars
  totalSeconds: number
  remainingSeconds: number // can be negative (overrun)
  isRunning: boolean
  isDone: boolean
  startedAt: number | null // Date.now() when last resumed
}

interface TimerContextType {
  timers: Map<string, TimerState>
  startTimer: (recipeId: string, stepIndex: number, stepLabel: string, recipeTitle: string, totalSeconds: number) => void
  pauseTimer: (id: string) => void
  resumeTimer: (id: string) => void
  resetTimer: (id: string) => void
  deleteTimer: (id: string) => void
  adjustTimer: (id: string, deltaSeconds: number) => void
}

const TimerContext = createContext<TimerContextType | undefined>(undefined)

let _audioCtx: AudioContext | null = null
function getAudioContext() {
  if (!_audioCtx || _audioCtx.state === 'closed') _audioCtx = new AudioContext()
  return _audioCtx
}

function playBell() {
  try {
    const ctx = getAudioContext()
    ;[1047, 1319, 1568].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'sine'; osc.frequency.value = freq
      const t = ctx.currentTime + i * 0.28
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.35, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.1)
      osc.start(t); osc.stop(t + 1.1)
    })
  } catch { /* ignore */ }
}

const SESSION_KEY = 'mx_timers'
const SESSION_TIMESTAMP_KEY = 'mx_timers_saved_at'

function loadFromSession(): Map<string, TimerState> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return new Map()
    const savedAt = parseInt(sessionStorage.getItem(SESSION_TIMESTAMP_KEY) || '0', 10)
    const now = Date.now()
    const elapsedMs = savedAt ? now - savedAt : 0
    const elapsedSeconds = Math.floor(elapsedMs / 1000)

    const entries: [string, TimerState][] = JSON.parse(raw)
    // Restore running timers, subtracting elapsed time during reload
    return new Map(entries.map(([k, t]) => [k, {
      ...t,
      remainingSeconds: t.isRunning ? Math.max(0, t.remainingSeconds - elapsedSeconds) : t.remainingSeconds,
      startedAt: t.isRunning ? now : null,
    }]))
  } catch {
    return new Map()
  }
}

function saveToSession(timers: Map<string, TimerState>) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...timers.entries()]))
    sessionStorage.setItem(SESSION_TIMESTAMP_KEY, String(Date.now()))
  } catch { /* ignore quota errors */ }
}

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [timers, setTimers] = useState<Map<string, TimerState>>(loadFromSession)
  const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

  const clearInterval_ = useCallback((id: string) => {
    const existing = intervalsRef.current.get(id)
    if (existing != null) {
      clearInterval(existing)
      intervalsRef.current.delete(id)
    }
  }, [])

  const startInterval = useCallback((id: string) => {
    clearInterval_(id)
    const handle = setInterval(() => {
      setTimers((prev) => {
        const timer = prev.get(id)
        if (!timer || !timer.isRunning || timer.startedAt == null) return prev
        const now = Date.now()
        const elapsed = Math.floor((now - timer.startedAt) / 1000)
        const newRemaining = Math.max(0, timer.remainingSeconds - elapsed)
        const justDone = timer.remainingSeconds > 0 && newRemaining <= 0 && !timer.isDone
        if (justDone) playBell()
        const next = new Map(prev)
        next.set(id, {
          ...timer,
          remainingSeconds: newRemaining,
          isDone: justDone ? true : timer.isDone,
          startedAt: now,
        })
        return next
      })
    }, 1000)
    intervalsRef.current.set(id, handle)
  }, [clearInterval_])

  // Background correction on mobile
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      setTimers((prev) => {
        const now = Date.now()
        const next = new Map(prev)
        let bellNeeded = false
        for (const [id, timer] of prev) {
          if (!timer.isRunning || timer.startedAt == null) continue
          const elapsed = Math.floor((now - timer.startedAt) / 1000)
          if (elapsed <= 0) continue
          const newRemaining = timer.remainingSeconds - elapsed
          const justDone = timer.remainingSeconds > 0 && newRemaining <= 0 && !timer.isDone
          if (justDone) bellNeeded = true
          next.set(id, {
            ...timer,
            remainingSeconds: newRemaining,
            isDone: justDone ? true : timer.isDone,
            startedAt: now,
          })
        }
        if (bellNeeded) playBell()
        return next
      })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // Cleanup all intervals on unmount
  useEffect(() => {
    const ref = intervalsRef.current
    return () => {
      for (const handle of ref.values()) clearInterval(handle)
    }
  }, [clearInterval_])

  // Restart intervals for running timers on mount (after reload)
  useEffect(() => {
    for (const [id, timer] of timers) {
      if (timer.isRunning) {
        startInterval(id)
      }
    }
  }, []) // Only on mount

  // Persist to sessionStorage on every change
  useEffect(() => {
    saveToSession(timers)
  }, [timers])

  const startTimer = useCallback((
    recipeId: string,
    stepIndex: number,
    stepLabel: string,
    recipeTitle: string,
    totalSeconds: number,
  ) => {
    const id = `${recipeId}:${stepIndex}`
    setTimers((prev) => {
      const existing = prev.get(id)
      const next = new Map(prev)
      if (existing && !existing.isDone) {
        // Resume existing (paused or running)
        next.set(id, { ...existing, isRunning: true, startedAt: Date.now() })
      } else {
        // Create new, or restart after done
        next.set(id, {
          id, recipeId, recipeTitle, stepIndex,
          stepLabel: stepLabel.slice(0, 30),
          totalSeconds, remainingSeconds: totalSeconds,
          isRunning: true, isDone: false, startedAt: Date.now(),
        })
      }
      return next
    })
    startInterval(id)
  }, [startInterval])

  const pauseTimer = useCallback((id: string) => {
    clearInterval_(id)
    setTimers((prev) => {
      const timer = prev.get(id)
      if (!timer) return prev
      const next = new Map(prev)
      next.set(id, { ...timer, isRunning: false, startedAt: null })
      return next
    })
  }, [clearInterval_])

  const resumeTimer = useCallback((id: string) => {
    setTimers((prev) => {
      const timer = prev.get(id)
      if (!timer) return prev
      const next = new Map(prev)
      next.set(id, { ...timer, isRunning: true, startedAt: Date.now() })
      return next
    })
    startInterval(id)
  }, [startInterval])

  const resetTimer = useCallback((id: string) => {
    clearInterval_(id)
    setTimers((prev) => {
      const timer = prev.get(id)
      if (!timer) return prev
      const next = new Map(prev)
      next.set(id, {
        ...timer,
        remainingSeconds: timer.totalSeconds,
        isRunning: false,
        isDone: false,
        startedAt: null,
      })
      return next
    })
  }, [clearInterval_])

  const deleteTimer = useCallback((id: string) => {
    clearInterval_(id)
    setTimers((prev) => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [clearInterval_])

  const adjustTimer = useCallback((id: string, deltaSeconds: number) => {
    setTimers((prev) => {
      const timer = prev.get(id)
      if (!timer) return prev
      const next = new Map(prev)
      const newRemaining = timer.isRunning
        ? Math.max(1, timer.remainingSeconds + deltaSeconds)
        : timer.remainingSeconds + deltaSeconds
      next.set(id, {
        ...timer,
        remainingSeconds: newRemaining,
        isDone: timer.isDone && newRemaining <= 0,
      })
      return next
    })
  }, [])

  return (
    <TimerContext.Provider value={{ timers, startTimer, pauseTimer, resumeTimer, resetTimer, deleteTimer, adjustTimer }}>
      {children}
    </TimerContext.Provider>
  )
}

export function useTimers() {
  const ctx = useContext(TimerContext)
  if (!ctx) throw new Error('useTimers must be used within TimerProvider')
  return ctx
}
