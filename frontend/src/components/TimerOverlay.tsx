import { useEffect, useMemo, useRef, useState } from 'react'
import { useTimers, type TimerState } from '../context/TimerContext'

function formatTime(seconds: number): string {
  const abs = Math.abs(seconds)
  const mm = String(Math.floor(abs / 60)).padStart(2, '0')
  const ss = String(abs % 60).padStart(2, '0')
  return seconds < 0 ? `−${mm}:${ss}` : `${mm}:${ss}`
}

interface TimerCardProps {
  timer: TimerState
  onClose: () => void
}

function TimerCard({ timer }: TimerCardProps) {
  const { pauseTimer, resumeTimer, resetTimer, deleteTimer, adjustTimer } = useTimers()
  const [swipeX, setSwipeX] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const touchStartX = useRef(0)
  const cardRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    setIsSwiping(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const delta = e.touches[0].clientX - touchStartX.current
    setSwipeX(delta)
  }

  const handleTouchEnd = () => {
    setIsSwiping(false)
    const cardWidth = cardRef.current?.offsetWidth ?? 300
    if (Math.abs(swipeX) > cardWidth * 0.6) {
      deleteTimer(timer.id)
    } else {
      setSwipeX(0)
    }
  }

  const labelText = timer.isRunning ? 'Läuft' : timer.isDone ? 'Abgelaufen' : timer.remainingSeconds < timer.totalSeconds ? 'Pausiert' : 'Bereit'

  return (
    <div className="relative overflow-hidden rounded-[1rem]">
      {/* Delete hint behind card */}
      <div className="absolute inset-0 flex items-center justify-center rounded-[1rem] bg-red-500">
        <span className="material-symbols-outlined text-white text-[24px]">delete</span>
      </div>

      {/* Card */}
      <div
        ref={cardRef}
        className="group relative flex items-center gap-3 rounded-[1rem] border border-[var(--mx-outline-variant)]/10 bg-[var(--mx-surface-variant)] p-3 touch-pan-y"
        style={{
          transform: `translateX(${swipeX}px)`,
          transition: isSwiping ? 'none' : 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Mouse delete button */}
        <button
          type="button"
          onClick={() => deleteTimer(timer.id)}
          aria-label="Timer löschen"
          className="absolute right-2 top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-[var(--mx-surface-high)] text-[var(--mx-on-surface-variant)] opacity-0 transition-opacity group-hover:flex group-hover:opacity-100"
        >
          <span className="material-symbols-outlined text-[13px]">close</span>
        </button>

        {/* Icon / spinner */}
        {timer.isRunning ? (
          <div className="h-10 w-10 flex-shrink-0 rounded-full border-4 border-[var(--mx-primary)] border-t-transparent animate-spin" style={{ animationDuration: '2s' }} />
        ) : (
          <span className="material-symbols-outlined flex-shrink-0 text-[22px] text-[var(--mx-secondary)]">timer</span>
        )}

        {/* Label + time */}
        <div className="min-w-[5rem] flex-1">
          <p className="mb-0.5 truncate text-[10px] font-bold uppercase tracking-widest text-[var(--mx-on-surface-variant)]">{timer.stepLabel}</p>
          <p className="font-headline text-2xl font-bold tracking-tighter text-[var(--mx-on-surface)]">{formatTime(timer.remainingSeconds)}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--mx-primary)]">{labelText}</p>
        </div>

        {/* Adjust buttons */}
        <div className="flex flex-col gap-1">
          <button onClick={() => adjustTimer(timer.id, 60)} title="+1 Min" className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--mx-surface-high)] text-[var(--mx-on-surface-variant)] hover:bg-[var(--mx-primary)]/10 hover:text-[var(--mx-primary)] transition-colors">
            <span className="material-symbols-outlined text-[14px]">add</span>
          </button>
          <button onClick={() => adjustTimer(timer.id, -60)} title="−1 Min" className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--mx-surface-high)] text-[var(--mx-on-surface-variant)] hover:bg-[var(--mx-primary)]/10 hover:text-[var(--mx-primary)] transition-colors">
            <span className="material-symbols-outlined text-[14px]">remove</span>
          </button>
        </div>

        {/* Action button */}
        {timer.isRunning ? (
          <button onClick={() => pauseTimer(timer.id)} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--mx-primary)] text-[var(--mx-on-primary)]">
            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>pause</span>
          </button>
        ) : (
          <div className="flex flex-col gap-1.5">
            <button onClick={() => resumeTimer(timer.id)} className="rounded-full bg-[var(--mx-primary)] px-3 py-1 text-xs font-bold text-[var(--mx-on-primary)] hover:bg-[var(--mx-primary-dim)] transition-colors">
              {timer.remainingSeconds < timer.totalSeconds ? 'Weiter' : 'Start'}
            </button>
            {timer.remainingSeconds !== timer.totalSeconds && (
              <button onClick={() => resetTimer(timer.id)} className="rounded-full border border-[var(--mx-outline-variant)] px-3 py-1 text-xs font-bold text-[var(--mx-on-surface-variant)] hover:bg-[var(--mx-surface-high)] transition-colors">Reset</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

interface TimerOverlayProps {
  open: boolean
  onClose: () => void
}

export function TimerOverlay({ open, onClose }: TimerOverlayProps) {
  const { timers } = useTimers()

  // Group timers by recipeId, preserving insertion order
  const groups = useMemo(() => {
    const map = new Map<string, { recipeTitle: string; timers: TimerState[] }>()
    for (const timer of timers.values()) {
      if (!map.has(timer.recipeId)) map.set(timer.recipeId, { recipeTitle: timer.recipeTitle, timers: [] })
      map.get(timer.recipeId)!.timers.push(timer)
    }
    return [...map.values()]
  }, [timers])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Mobile: bottom sheet — Desktop: centered modal */}
      <div className="fixed inset-x-0 bottom-0 z-50 md:inset-0 md:flex md:items-center md:justify-center md:p-4">
        <div className="w-full rounded-t-[2rem] bg-[var(--mx-surface)] shadow-2xl md:max-w-[480px] md:rounded-[2rem]">
          {/* Drag handle (mobile only) */}
          <div className="flex justify-center pt-3 md:hidden">
            <div className="h-1 w-10 rounded-full bg-[var(--mx-outline-variant)]" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-[var(--mx-primary)]">timer</span>
              <h2 className="font-headline text-lg font-bold text-[var(--mx-on-surface)]">Laufende Timer</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--mx-on-surface-variant)] hover:bg-[var(--mx-surface-container)] transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          {/* Timer list */}
          <div className="max-h-[70dvh] overflow-y-auto px-4 pb-6 space-y-5">
            {groups.map((group) => (
              <div key={group.timers[0].recipeId}>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--mx-on-surface-variant)]">{group.recipeTitle}</p>
                <div className="space-y-2">
                  {group.timers.map((timer) => (
                    <TimerCard key={timer.id} timer={timer} onClose={onClose} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
