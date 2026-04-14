import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { getRecipe } from '../lib/api'

function parseIngredientReference(text: string): Array<{ type: 'text' | 'ref'; content: string }> {
  const parts: Array<{ type: 'text' | 'ref'; content: string }> = []
  const regex = /\{(\d+)\}/g
  let lastIndex = 0
  let match
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    parts.push({ type: 'ref', content: match[1] })
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) parts.push({ type: 'text', content: text.slice(lastIndex) })
  return parts.length > 0 ? parts : [{ type: 'text', content: text }]
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
            onClick={() => setHighlightedRef(isHighlighted ? null : sortOrder)}
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
    <div className="mx-shell py-8">
      <div className="rounded-[2.5rem] bg-[var(--mx-surface-container)] p-6 md:p-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--mx-on-surface-variant)]">Kochmodus</p>
            <h1 className="m-0 text-3xl text-[var(--mx-on-surface)] md:text-5xl">{recipe.title}</h1>
          </div>
          <Link
            to={`/recipes/${recipe.id}`}
            className="rounded-full bg-[var(--mx-surface-high)] px-5 py-2 text-sm font-semibold text-[var(--mx-on-surface)]"
          >
            Zurück zum Rezept
          </Link>
        </div>

        <div className="mb-8 rounded-[2rem] bg-[var(--mx-surface-low)] p-8">
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--mx-on-surface-variant)]">
            Schritt {currentStep + 1} von {recipe.steps.length}
          </p>
          <p className="mt-5 text-xl leading-relaxed text-[var(--mx-on-surface)] md:text-3xl">{renderStepText(step.text)}</p>
        </div>

        <div className="mx-glass mb-8 flex flex-col items-center gap-5 rounded-[2rem] p-6 md:flex-row md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--mx-primary)]">Zeitgeber</p>
            <p className="text-5xl font-bold text-[var(--mx-primary)] md:text-6xl">{formatTime(seconds)}</p>
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

        <div className="flex gap-3">
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
      </div>
    </div>
  )
}
