import { useMemo } from 'react'
import { useTimers } from '../context/TimerContext'

interface GlobalTimerButtonProps {
  onClick: () => void
}

export function GlobalTimerButton({ onClick }: GlobalTimerButtonProps) {
  const { timers } = useTimers()

  const { count, hasDone } = useMemo(() => {
    let hasDone = false
    for (const t of timers.values()) {
      if (t.isDone) hasDone = true
    }
    return { count: timers.size, hasDone }
  }, [timers])

  if (count === 0) return null

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${count} laufende Timer`}
      className="relative flex h-9 w-9 items-center justify-center rounded-full text-[var(--mx-on-surface-variant)] hover:bg-[var(--mx-surface-container)] transition-colors"
    >
      <span
        className={`material-symbols-outlined text-[22px] ${hasDone ? 'animate-pulse text-[var(--mx-primary)]' : ''}`}
        style={{ fontVariationSettings: "'FILL' 0" }}
      >
        timer
      </span>
      <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--mx-primary)] text-[9px] font-bold text-[var(--mx-on-primary)]">
        {count}
      </span>
    </button>
  )
}
