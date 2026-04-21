import { useEffect, useMemo, useState } from 'react'
import { useTimers } from '../context/TimerContext'

interface GlobalTimerButtonProps {
  onClick: () => void
}

export function GlobalTimerButton({ onClick }: GlobalTimerButtonProps) {
  const { timers } = useTimers()
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)

  const { count, hasDone } = useMemo(() => {
    let hasDone = false
    for (const t of timers.values()) {
      if (t.isDone) hasDone = true
    }
    return { count: timers.size, hasDone }
  }, [timers])

  useEffect(() => {
    if (count > 0) {
      setMounted(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
    } else {
      setVisible(false)
      const t = setTimeout(() => setMounted(false), 250)
      return () => clearTimeout(t)
    }
  }, [count])

  if (!mounted) return null

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${count} laufende Timer`}
      className="relative flex h-9 w-9 items-center justify-center rounded-full text-[var(--mx-on-surface-variant)] hover:bg-[var(--mx-surface-container)] transition-colors"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1)' : 'scale(0.6)',
        transition: 'opacity 0.25s ease, transform 0.25s cubic-bezier(0.34,1.56,0.64,1)',
      }}
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
