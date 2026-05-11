import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Audio } from 'expo-av'
import { TIMERS_KEY } from '@miximixi/shared/constants'

export interface TimerState {
  id: string
  recipeId: string
  recipeTitle: string
  stepIndex: number
  stepLabel: string
  totalSeconds: number
  isRunning: boolean
  isDone: boolean
  deadlineMs: number | null
  pausedRemaining: number | null
}

interface TimerContextType {
  timers: Map<string, TimerState>
  hydrated: boolean
  getRemainingSeconds: (timer: TimerState) => number
  startTimer: (recipeId: string, stepIndex: number, stepLabel: string, recipeTitle: string, totalSeconds: number) => void
  pauseTimer: (id: string) => void
  resumeTimer: (id: string) => void
  resetTimer: (id: string) => void
  deleteTimer: (id: string) => void
  adjustTimer: (id: string, deltaSeconds: number) => void
  initializeTimer: (recipeId: string, stepIndex: number, stepLabel: string, recipeTitle: string, totalSeconds: number) => void
}

const TimerContext = createContext<TimerContextType | undefined>(undefined)

async function loadFromStorage(): Promise<Map<string, TimerState>> {
  try {
    const raw = await AsyncStorage.getItem(TIMERS_KEY)
    if (!raw) return new Map()
    const entries: [string, TimerState][] = JSON.parse(raw)
    const now = Date.now()
    return new Map(entries.map(([k, t]) => {
      if (!t.isRunning || t.deadlineMs == null) return [k, t]
      const remaining = Math.max(0, t.deadlineMs - now)
      return [k, { ...t, isDone: remaining === 0 ? true : t.isDone }]
    }))
  } catch {
    return new Map()
  }
}

function saveToStorage(timers: Map<string, TimerState>) {
  AsyncStorage.setItem(TIMERS_KEY, JSON.stringify([...timers.entries()])).catch(() => {})
}

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [timers, setTimers] = useState<Map<string, TimerState>>(new Map())
  const [hydrated, setHydrated] = useState(false)
  const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())
  const [, setForceRender] = useState(0)
  const soundRef = useRef<Audio.Sound | null>(null)

  // Load persisted timers and set up audio
  useEffect(() => {
    loadFromStorage().then(loaded => {
      setTimers(loaded)
      setHydrated(true)
      // Restart intervals for running timers
      for (const [id, timer] of loaded) {
        if (timer.isRunning) startIntervalForId(id)
      }
    })

    Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {})
    Audio.Sound.createAsync(require('../../assets/audio/gong.mp3')).then(({ sound }) => {
      soundRef.current = sound
    }).catch(() => {})

    return () => {
      soundRef.current?.unloadAsync().catch(() => {})
      for (const h of intervalsRef.current.values()) clearInterval(h)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist on every change
  useEffect(() => {
    if (hydrated) saveToStorage(timers)
  }, [timers, hydrated])

  // Force re-render every second for smooth countdown display
  useEffect(() => {
    const h = setInterval(() => setForceRender(r => r + 1), 1000)
    return () => clearInterval(h)
  }, [])

  const clearIntervalById = useCallback((id: string) => {
    const existing = intervalsRef.current.get(id)
    if (existing != null) {
      clearInterval(existing)
      intervalsRef.current.delete(id)
    }
  }, [])

  const startIntervalForId = useCallback((id: string) => {
    clearIntervalById(id)
    const h = setInterval(() => {
      setTimers(prev => {
        const timer = prev.get(id)
        if (!timer || !timer.isRunning || timer.deadlineMs == null) return prev
        const remaining = timer.deadlineMs - Date.now()
        if (remaining <= 0 && !timer.isDone) {
          soundRef.current?.replayAsync().catch(() => {})
          const next = new Map(prev)
          next.set(id, { ...timer, isDone: true, isRunning: false })
          return next
        }
        return prev
      })
      setForceRender(r => r + 1)
    }, 100)
    intervalsRef.current.set(id, h)
  }, [clearIntervalById])

  const getRemainingSeconds = useCallback((timer: TimerState): number => {
    if (!timer.isRunning && timer.pausedRemaining != null) return timer.pausedRemaining
    if (!timer.isRunning && timer.pausedRemaining == null) return timer.totalSeconds
    if (timer.deadlineMs == null) return timer.totalSeconds
    return Math.max(0, Math.floor((timer.deadlineMs - Date.now()) / 1000))
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
    setTimers(prev => {
      const existing = prev.get(id)
      const next = new Map(prev)
      if (existing && !existing.isDone) {
        const remaining = Math.max(0, existing.pausedRemaining ?? totalSeconds)
        next.set(id, { ...existing, isRunning: true, deadlineMs: now + remaining * 1000, pausedRemaining: null })
      } else {
        next.set(id, {
          id, recipeId, recipeTitle, stepIndex,
          stepLabel: stepLabel.slice(0, 30),
          totalSeconds,
          isRunning: true,
          isDone: false,
          deadlineMs: now + totalSeconds * 1000,
          pausedRemaining: null,
        })
      }
      return next
    })
    startIntervalForId(id)
  }, [startIntervalForId])

  const pauseTimer = useCallback((id: string) => {
    clearIntervalById(id)
    setTimers(prev => {
      const timer = prev.get(id)
      if (!timer) return prev
      const next = new Map(prev)
      const remaining = getRemainingSeconds(timer)
      next.set(id, { ...timer, isRunning: false, pausedRemaining: remaining, deadlineMs: null })
      return next
    })
  }, [clearIntervalById, getRemainingSeconds])

  const resumeTimer = useCallback((id: string) => {
    setTimers(prev => {
      const timer = prev.get(id)
      if (!timer) return prev
      const next = new Map(prev)
      const remaining = getRemainingSeconds(timer)
      next.set(id, { ...timer, isRunning: true, deadlineMs: Date.now() + remaining * 1000, pausedRemaining: null })
      return next
    })
    startIntervalForId(id)
  }, [startIntervalForId, getRemainingSeconds])

  const resetTimer = useCallback((id: string) => {
    clearIntervalById(id)
    setTimers(prev => { const n = new Map(prev); n.delete(id); return n })
  }, [clearIntervalById])

  const deleteTimer = useCallback((id: string) => {
    clearIntervalById(id)
    setTimers(prev => { const n = new Map(prev); n.delete(id); return n })
  }, [clearIntervalById])

  const adjustTimer = useCallback((id: string, deltaSeconds: number) => {
    setTimers(prev => {
      const timer = prev.get(id)
      if (!timer) return prev
      const next = new Map(prev)
      if (timer.isRunning && timer.deadlineMs != null) {
        next.set(id, { ...timer, deadlineMs: Math.max(Date.now(), timer.deadlineMs + deltaSeconds * 1000) })
      } else {
        const current = getRemainingSeconds(timer)
        next.set(id, { ...timer, pausedRemaining: Math.max(0, current + deltaSeconds) })
      }
      return next
    })
  }, [getRemainingSeconds])

  const initializeTimer = useCallback((
    recipeId: string,
    stepIndex: number,
    stepLabel: string,
    recipeTitle: string,
    totalSeconds: number,
  ) => {
    const id = `${recipeId}:${stepIndex}`
    setTimers(prev => {
      if (prev.get(id)) return prev
      const next = new Map(prev)
      next.set(id, {
        id, recipeId, recipeTitle, stepIndex,
        stepLabel: stepLabel.slice(0, 30),
        totalSeconds,
        isRunning: false,
        isDone: false,
        deadlineMs: null,
        pausedRemaining: totalSeconds,
      })
      return next
    })
  }, [])

  return (
    <TimerContext.Provider value={{
      timers, hydrated, getRemainingSeconds,
      startTimer, pauseTimer, resumeTimer, resetTimer, deleteTimer, adjustTimer, initializeTimer,
    }}>
      {children}
    </TimerContext.Provider>
  )
}

export function useTimers(): TimerContextType {
  const ctx = useContext(TimerContext)
  if (!ctx) throw new Error('useTimers must be used within TimerProvider')
  return ctx
}
