import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { getRecipe } from '../lib/api'
import { useTimers } from '../context/TimerContext'
import { useDocumentTitle } from '../lib/useDocumentTitle'

function parseIngredientReference(text: string): Array<{ type: 'text' | 'ref'; content: string; label: string }> {
  const parts: Array<{ type: 'text' | 'ref'; content: string; label: string }> = []
  const regex = /\[([^\]]+)\]\{(\d+)\}/g
  let lastIndex = 0
  let match
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index), label: '' })
    }
    parts.push({ type: 'ref', content: match[2], label: match[1] })
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) parts.push({ type: 'text', content: text.slice(lastIndex), label: '' })
  return parts.length > 0 ? parts : [{ type: 'text', content: text, label: '' }]
}

function formatTime(totalSeconds: number): string {
  const abs = Math.abs(totalSeconds)
  const minutes = Math.floor(abs / 60)
  const secs = abs % 60
  const formatted = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  return totalSeconds < 0 ? `−${formatted}` : formatted
}

export function CookPage() {
  const { recipeSlug } = useParams<{ recipeSlug: string }>()
  const navigate = useNavigate()
  // Extrahiere UUID aus slug-uuid Format (letzte 36 Zeichen)
  const recipeId = recipeSlug && recipeSlug.length > 36 && recipeSlug[recipeSlug.length - 37] === '-'
    ? recipeSlug.slice(-36)
    : recipeSlug
  const [currentStep, setCurrentStep] = useState(0)
  const [highlightedRef, setHighlightedRef] = useState<string | null>(null)
  const bubbleTimerRef = useRef<number | null>(null)

  // Prevent screen timeout while cooking
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    let sentinel: WakeLockSentinel | null = null

    const acquire = () =>
      navigator.wakeLock.request('screen').then((s) => { sentinel = s }).catch(() => {})

    acquire()
    const onVisible = () => { if (document.visibilityState === 'visible') acquire() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      sentinel?.release()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const handleGoToRecipe = () => {
    if ('startViewTransition' in document) {
      document.documentElement.dataset.navdir = 'back'
      ;(document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(() => {
        flushSync(() => navigate(-1))
      })
    } else {
      navigate(-1)
    }
  }

  const recipeQuery = useQuery({
    queryKey: ['recipe', recipeId, 'cook'],
    queryFn: () => getRecipe(recipeId || ''),
    enabled: Boolean(recipeId),
  })

  useDocumentTitle(recipeQuery.data ? `Miximixi - ${recipeQuery.data.title} (Koch-Modus)` : 'Miximixi')

  const { timers, getRemainingSeconds, startTimer, pauseTimer, resumeTimer, resetTimer, adjustTimer, initializeTimer } = useTimers()

  const timerId = recipeId ? `${recipeId}:${currentStep}` : null
  const currentTimer = timerId ? timers.get(timerId) : undefined

  const stepDuration = useMemo(() => {
    const minutes = recipeQuery.data?.steps[currentStep]?.time_minutes ?? 5
    return minutes * 60
  }, [currentStep, recipeQuery.data?.steps])

  const seconds = currentTimer ? getRemainingSeconds(currentTimer) : stepDuration
  const isRunning = currentTimer?.isRunning ?? false

  const ingredientBySortOrder = useMemo(() => {
    const map = new Map<string, { name: string; amount: number | null; unit: string | null }>()
    for (const ing of recipeQuery.data?.ingredients ?? []) {
      map.set(String(ing.sort_order), { name: ing.name, amount: ing.amount, unit: ing.unit })
    }
    return map
  }, [recipeQuery.data?.ingredients])

  if (recipeQuery.isLoading) {
    return <p className="mx-shell mt-8 rounded-[2rem] bg-[var(--mx-surface-low)] p-8">Lade Kochmodus …</p>
  }

  if (recipeQuery.error || !recipeQuery.data) {
    return <p className="mx-shell mt-8 rounded-[2rem] bg-red-100/70 p-8 text-red-800">Kochmodus konnte nicht geladen werden.</p>
  }
  const recipe = recipeQuery.data
  const step = recipe.steps[currentStep]

  const renderStepText = (text: string) => {
    const parts = parseIngredientReference(text)
    return parts.map((part, i) => {
      if (part.type === 'text') {
        return <span key={i}>{part.content}</span>
      }
      const sortOrder = part.content
      const ing = ingredientBySortOrder.get(sortOrder)
      const isHighlighted = highlightedRef === sortOrder
      const amtText = ing
        ? [ing.amount != null ? String(Math.round(ing.amount * 10) / 10) : null, ing.unit].filter(Boolean).join(' ')
        : null
      return (
        <span key={i} className="relative inline-block">
          <button
            type="button"
            onClick={() => {
            if (isHighlighted) {
              setHighlightedRef(null)
              if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
            } else {
              setHighlightedRef(sortOrder)
              if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current)
              bubbleTimerRef.current = window.setTimeout(() => setHighlightedRef(null), 3000)
            }
          }}
            className={`rounded-md px-1.5 py-0.5 text-inherit font-semibold transition-colors ${isHighlighted ? 'bg-[var(--mx-primary)] text-[var(--mx-on-primary)]' : 'bg-[var(--mx-primary-container)]/30 text-[var(--mx-primary)] hover:bg-[var(--mx-primary-container)]/60'}`}
          >
            {part.label}
          </button>
          {isHighlighted && amtText && (
            <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--mx-on-surface)] px-3 py-1.5 text-sm font-bold text-[var(--mx-surface)] shadow-lg z-10">
              {amtText}
              <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[var(--mx-on-surface)]" />
            </span>
          )}
        </span>
      )
    })
  }

  return (
    <>
    <div className="mx-shell py-4 pb-28">
      <div className="rounded-[2.5rem] bg-[var(--mx-surface-container)] p-4 md:p-6">
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={handleGoToRecipe}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--mx-surface-high)] text-[var(--mx-on-surface)] hover:bg-[var(--mx-surface-variant)] transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--mx-on-surface-variant)]">Kochmodus</p>
            <h1 className="m-0 text-lg font-bold text-[var(--mx-on-surface)] md:text-2xl">{recipe.title}</h1>
          </div>
        </div>

        <div className="mb-4 rounded-[2rem] bg-[var(--mx-surface-low)] p-4 md:p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--mx-on-surface-variant)]">
            Schritt {currentStep + 1} von {recipe.steps.length}
          </p>
          <p className="mt-3 text-base leading-relaxed text-[var(--mx-on-surface)] md:text-lg">{renderStepText(step.text)}</p>
        </div>

        <div className="mx-glass mb-4 flex flex-col items-center gap-3 rounded-[2rem] p-4 md:flex-row md:justify-between md:p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--mx-primary)]">Timer</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!recipeId || !recipeQuery.data) return
                  if (!currentTimer) {
                    initializeTimer(recipeId, currentStep, `Schritt ${currentStep + 1}`, recipeQuery.data.title ?? '', stepDuration)
                  }
                  adjustTimer(`${recipeId}:${currentStep}`, -60)
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--mx-surface-high)] text-lg font-bold text-[var(--mx-on-surface)]"
              >−</button>
              <p className="text-3xl font-bold text-[var(--mx-primary)] md:text-4xl">{formatTime(seconds)}</p>
              <button
                type="button"
                onClick={() => {
                  if (!recipeId || !recipeQuery.data) return
                  if (!currentTimer) {
                    initializeTimer(recipeId, currentStep, `Schritt ${currentStep + 1}`, recipeQuery.data.title ?? '', stepDuration)
                  }
                  adjustTimer(`${recipeId}:${currentStep}`, 60)
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--mx-surface-high)] text-lg font-bold text-[var(--mx-on-surface)]"
              >+</button>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                if (!recipeId || !recipeQuery.data) return
                if (!currentTimer) {
                  startTimer(recipeId, currentStep, `Schritt ${currentStep + 1}`, recipeQuery.data.title ?? '', stepDuration)
                } else if (isRunning) {
                  pauseTimer(`${recipeId}:${currentStep}`)
                } else {
                  resumeTimer(`${recipeId}:${currentStep}`)
                }
              }}
              className="rounded-full bg-[var(--mx-primary)] px-6 py-3 text-sm font-bold text-[var(--mx-on-primary)]"
            >
              {isRunning ? 'Pausieren' : 'Starten'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (recipeId) resetTimer(`${recipeId}:${currentStep}`)
              }}
              className="rounded-full bg-[var(--mx-surface-high)] px-6 py-3 text-sm font-bold text-[var(--mx-on-surface)]"
            >
              Zurücksetzen
            </button>
          </div>
        </div>

      </div>
    </div>

    {/* Fixed bottom navigation */}
    <div className="fixed bottom-0 left-0 right-0 z-40 flex gap-3 bg-[var(--mx-surface-container)]/90 px-4 py-4 backdrop-blur-md">
      <button
        type="button"
        onClick={() => {
          setCurrentStep((prev) => Math.max(prev - 1, 0))
          setHighlightedRef(null)
        }}
        disabled={currentStep === 0}
        className="flex-1 rounded-full bg-[var(--mx-surface-high)] px-6 py-4 text-sm font-bold text-[var(--mx-on-surface)] disabled:opacity-40"
      >
        Zurück
      </button>
      <button
        type="button"
        onClick={() => {
          setCurrentStep((prev) => Math.min(prev + 1, recipe.steps.length - 1))
          setHighlightedRef(null)
        }}
        disabled={currentStep === recipe.steps.length - 1}
        className="flex-[2] rounded-full bg-gradient-to-r from-[var(--mx-primary)] to-[var(--mx-primary-dim)] px-6 py-4 text-sm font-bold text-[var(--mx-on-primary)] disabled:opacity-40"
      >
        Nächster Schritt
      </button>
    </div>
    </>
  )
}
