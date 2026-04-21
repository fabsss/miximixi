/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

export interface TimerState {
  id: string              // "recipeId:stepIndex"
  recipeId: string
  recipeTitle: string
  stepIndex: number
  stepLabel: string       // ≤30 chars
  totalSeconds: number
  isRunning: boolean
  isDone: boolean
  deadlineMs: number | null  // when timer should finish (Date.now() value), not remaining seconds
}

interface TimerContextType {
  timers: Map<string, TimerState>
  getRemainingSeconds: (timer: TimerState) => number  // calculate remaining from deadline
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

function loadFromSession(): Map<string, TimerState> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return new Map()
    const entries: [string, TimerState][] = JSON.parse(raw)
    const now = Date.now()
    // Restore timers, updating deadlines for any that were running
    return new Map(entries.map(([k, t]) => {
      if (!t.isRunning || t.deadlineMs == null) {
        return [k, t]
      }
      // Timer was running: it has a deadline. If deadline has passed, mark as done.
      const remaining = Math.max(0, t.deadlineMs - now)
      const isDone = remaining === 0 && !t.isDone
      return [k, { ...t, isDone: isDone ? true : t.isDone }]
    }))
  } catch {
    return new Map()
  }
}

function saveToSession(timers: Map<string, TimerState>) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...timers.entries()]))
  } catch { /* ignore quota errors */ }
}

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [timers, setTimers] = useState<Map<string, TimerState>>(loadFromSession)
  const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())
  const [, setForceRender] = useState(0)  // trigger re-renders for display updates

  const getRemainingSeconds = useCallback((timer: TimerState): number => {
    if (timer.deadlineMs == null) return timer.totalSeconds
    const remaining = Math.floor((timer.deadlineMs - Date.now()) / 1000)
    return Math.max(0, remaining)
  }, [])

  const clearInterval_ = useCallback((id: string) => {
    const existing = intervalsRef.current.get(id)
    if (existing != null) {
      clearInterval(existing)
      intervalsRef.current.delete(id)
    }
  }, [])

  const startInterval = useCallback((id: string) => {
    clearInterval_(id)
    // Fire every 100ms for smooth display, check for completion on every tick
    const handle = setInterval(() => {
      setTimers((prev) => {
        const timer = prev.get(id)
        if (!timer || !timer.isRunning || timer.deadlineMs == null) return prev

        const now = Date.now()
        const remaining = timer.deadlineMs - now

        // Check if timer just finished
        if (remaining <= 0 && !timer.isDone) {
          playBell()
          const next = new Map(prev)
          next.set(id, { ...timer, isDone: true, isRunning: false })
          return next
        }

        return prev
      })
      // Force UI update for smooth countdown
      setForceRender(r => r + 1)
    }, 100)
    intervalsRef.current.set(id, handle)
  }, [clearInterval_])

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

  // Re-render every second so display updates even without state changes
  useEffect(() => {
    const handle = setInterval(() => {
      setForceRender(r => r + 1)
    }, 1000)
    return () => clearInterval(handle)
  }, [])

  const startTimer = useCallback((
    recipeId: string,
    stepIndex: number,
    stepLabel: string,
    recipeTitle: string,
    totalSeconds: number,
  ) => {
    const id = `${recipeId}:${stepIndex}`
    const now = Date.now()
    const deadline = now + totalSeconds * 1000
    setTimers((prev) => {
      const existing = prev.get(id)
      const next = new Map(prev)
      if (existing && !existing.isDone) {
        // Resume existing timer: recalculate deadline based on remaining time
        const remaining = getRemainingSeconds(existing)
        next.set(id, {
          ...existing,
          isRunning: true,
          deadlineMs: now + remaining * 1000,
        })
      } else {
        // Create new timer
        next.set(id, {
          id, recipeId, recipeTitle, stepIndex,
          stepLabel: stepLabel.slice(0, 30),
          totalSeconds,
          isRunning: true,
          isDone: false,
          deadlineMs: deadline,
        })
      }
      return next
    })
    startInterval(id)
  }, [startInterval, getRemainingSeconds])

  const pauseTimer = useCallback((id: string) => {
    clearInterval_(id)
    setTimers((prev) => {
      const timer = prev.get(id)
      if (!timer || timer.deadlineMs == null) return prev
      const next = new Map(prev)
      const remaining = getRemainingSeconds(timer)
      next.set(id, {
        ...timer,
        isRunning: false,
        deadlineMs: Date.now() + remaining * 1000,  // Freeze deadline at current remaining time
      })
      return next
    })
  }, [clearInterval_, getRemainingSeconds])

  const resumeTimer = useCallback((id: string) => {
    setTimers((prev) => {
      const timer = prev.get(id)
      if (!timer) return prev
      const next = new Map(prev)
      const remaining = getRemainingSeconds(timer)
      next.set(id, {
        ...timer,
        isRunning: true,
        deadlineMs: Date.now() + remaining * 1000,
      })
      return next
    })
    startInterval(id)
  }, [startInterval, getRemainingSeconds])

  const resetTimer = useCallback((id: string) => {
    clearInterval_(id)
    setTimers((prev) => {
      const timer = prev.get(id)
      if (!timer) return prev
      const next = new Map(prev)
      next.set(id, {
        ...timer,
        deadlineMs: Date.now() + timer.totalSeconds * 1000,
        isRunning: false,
        isDone: false,
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
      if (!timer || timer.deadlineMs == null) return prev
      const next = new Map(prev)
      const newDeadline = Math.max(Date.now(), timer.deadlineMs + deltaSeconds * 1000)
      next.set(id, {
        ...timer,
        deadlineMs: newDeadline,
        isDone: timer.isDone && getRemainingSeconds(timer) <= 0,
      })
      return next
    })
  }, [getRemainingSeconds])

  return (
    <TimerContext.Provider value={{ timers, getRemainingSeconds, startTimer, pauseTimer, resumeTimer, resetTimer, deleteTimer, adjustTimer }}>
      {children}
    </TimerContext.Provider>
  )
}

export function useTimers() {
  const ctx = useContext(TimerContext)
  if (!ctx) throw new Error('useTimers must be used within TimerProvider')
  return ctx
}
