import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { getRecipe } from '../lib/api'

function parseIngredientReference(text: string): Array<{ type: 'text' | 'ref'; content: string; label: string }> {
  const parts: Array<{ type: 'text' | 'ref'; content: string; label: string }> = []
  const regex = /(\S+)\s*\{(\d+)\}/g
  let lastIndex = 0
  let match
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ type: 'text', content: text.slice(lastIndex, match.index), label: '' })
    parts.push({ type: 'ref', content: match[2], label: match[1] })
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) parts.push({ type: 'text', content: text.slice(lastIndex), label: '' })
  return parts.length > 0 ? parts : [{ type: 'text', content: text, label: '' }]
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function CookPage() {
  const { recipeId } = useParams<{ recipeId: string }>()
  const [currentStep, setCurrentStep] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [secondsOverride, setSecondsOverride] = useState<number | null>(null)
  const [highlightedRef, setHighlightedRef] = useState<string | null>(null)
  const bubbleTimerRef = useRef<number | null>(null)

  const recipeQuery = useQuery({
    queryKey: ['recipe', recipeId, 'cook'],
    queryFn: () => getRecipe(recipeId || ''),
    enabled: Boolean(recipeId),
  })

  const stepDuration = useMemo(() => {
    const minutes = recipeQuery.data?.steps[currentStep]?.time_minutes ?? 5
    return minutes * 60
  }, [currentStep, recipeQuery.data?.steps])

  const seconds = secondsOverride ?? stepDuration

  const ingredientBySortOrder = useMemo(() => {
    const map = new Map<string, { name: string; amount: number | null; unit: string | null }>()
    for (const ing of recipeQuery.data?.ingredients ?? []) {
      map.set(String(ing.sort_order), { name: ing.name, amount: ing.amount, unit: ing.unit })
    }
    return map
  }, [recipeQuery.data?.ingredients])

  useEffect(() => {
    if (!isRunning || seconds <= 0) {
      return
    }
    const timer = window.setInterval(() => {
      setSecondsOverride((prev) => {
        const value = prev ?? stepDuration
        const next = Math.max(value - 1, 0)
        if (next === 0) {
          setIsRunning(false)
        }
        return next
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [isRunning, seconds, stepDuration])

  if (recipeQuery.isLoading) {
    return <p className="mx-shell mt-8 rounded-[2rem] bg-[var(--mx-surface-low)] p-8">Lade Kochmodus …</p>
  }

  if (recipeQuery.error || !recipeQuery.data) {
    return <p className="mx-shell mt-8 rounded-[2rem] bg-red-100/70 p-8 text-red-800">Kochmodus konnte nicht geladen werden.</p>
  }

  const recipe = recipeQuery.data
  const step = recipe.steps[currentStep]

  const renderStepText = (text: string) => {
    return parseIngredientReference(text).map((part, i) => {
      if (part.type === 'text') return <span key={i}>{part.content}</span>
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
            {ing?.name ?? `Zutat #${sortOrder}`}
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
          <Link
            to={`/recipes/${recipe.id}`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--mx-surface-high)] text-[var(--mx-on-surface)]"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </Link>
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
                onClick={() => setSecondsOverride((s) => Math.max(0, (s ?? stepDuration) - 60))}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--mx-surface-high)] text-lg font-bold text-[var(--mx-on-surface)]"
              >−</button>
              <p className="text-3xl font-bold text-[var(--mx-primary)] md:text-4xl">{formatTime(seconds)}</p>
              <button
                type="button"
                onClick={() => setSecondsOverride((s) => (s ?? stepDuration) + 60)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--mx-surface-high)] text-lg font-bold text-[var(--mx-on-surface)]"
              >+</button>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setIsRunning((prev) => !prev)}
              className="rounded-full bg-[var(--mx-primary)] px-6 py-3 text-sm font-bold text-[var(--mx-on-primary)]"
            >
              {isRunning ? 'Pausieren' : 'Starten'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsRunning(false)
                setSecondsOverride(null)
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
          setIsRunning(false)
          setSecondsOverride(null)
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
          setIsRunning(false)
          setSecondsOverride(null)
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
