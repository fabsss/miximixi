import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { getImageUrl, getRecipe, translateRecipe, updateRecipe, type RecipeUpdateRequest, type TranslationResponse } from '../lib/api'
import type { Ingredient } from '../types'

type RecipeUpdateData = RecipeUpdateRequest

// Unit conversion factors
const CONVERSIONS: Record<string, Record<string, number>> = {
  cup: { ml: 236.588 },
  tbsp: { g: 15, ml: 15 },
  tsp: { g: 5, ml: 5 },
  oz: { g: 28.35 },
  lb: { g: 453.592 },
  ml: { cup: 0.00423144 },
  g: { oz: 0.035274, lb: 0.00220462 },
}

function convertAmount(amount: number, fromUnit: string | null, toUnit: string | null): number | null {
  if (!fromUnit || !toUnit || fromUnit === toUnit) return null
  const key = fromUnit.toLowerCase()
  return CONVERSIONS[key]?.[toUnit.toLowerCase()] ? amount * CONVERSIONS[key][toUnit.toLowerCase()] : null
}

function parseIngredientReference(text: string): Array<{ type: 'text' | 'ref'; content: string }> {
  const parts: Array<{ type: 'text' | 'ref'; content: string }> = []
  const regex = /\{(\d+)\}/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.substring(lastIndex, match.index) })
    }
    parts.push({ type: 'ref', content: match[1] })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.substring(lastIndex) })
  }

  return parts.length > 0 ? parts : [{ type: 'text', content: text }]
}

export function RecipeDetailPage() {
  const { recipeId } = useParams<{ recipeId: string }>()
  const [convertToMetric, setConvertToMetric] = useState(false)
  const [servingsMultiplier, setServingsMultiplier] = useState(1)
  const [highlightedIngredientId, setHighlightedIngredientId] = useState<string | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showTranslateModal, setShowTranslateModal] = useState(false)
  const [showNotesModal, setShowNotesModal] = useState(false)
  const [translateLang, setTranslateLang] = useState('en')
  const [translation, setTranslation] = useState<TranslationResponse | null>(null)

  const recipeQuery = useQuery({
    queryKey: ['recipe', recipeId],
    queryFn: () => getRecipe(recipeId || ''),
    enabled: Boolean(recipeId),
  })

  const translateMutation = useMutation({
    mutationFn: ({ recipeId, lang }: { recipeId: string; lang: string }) =>
      translateRecipe(recipeId, lang),
    onSuccess: (data: TranslationResponse) => {
      setTranslation(data)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ recipeId, data }: { recipeId: string; data: RecipeUpdateData }) =>
      updateRecipe(recipeId, data),
    onSuccess: () => {
      recipeQuery.refetch()
      setShowEditModal(false)
      setShowNotesModal(false)
    },
  })

  const groupedIngredients = useMemo(() => {
    const map = new Map<string, Ingredient[]>()
    for (const ingredient of recipeQuery.data?.ingredients ?? []) {
      const section = ingredient.section || 'Zutaten'
      if (!map.has(section)) {
        map.set(section, [])
      }
      map.get(section)?.push(ingredient)
    }
    return map
  }, [recipeQuery.data?.ingredients])

  const handleTranslate = () => {
    if (recipeId && translateLang) {
      translateMutation.mutate({ recipeId, lang: translateLang })
    }
  }

  if (recipeQuery.isLoading) {
    return <p className="rounded-[2rem] bg-[var(--mx-surface-low)] p-8">Lade Rezept …</p>
  }

  if (recipeQuery.error || !recipeQuery.data) {
    return <p className="rounded-[2rem] bg-red-100/70 p-8 text-red-800">Rezept konnte nicht geladen werden.</p>
  }

  const recipe = recipeQuery.data

  return (
    <div className="space-y-8">
      {/* Hero Image */}
      <section className="relative overflow-hidden rounded-[2.5rem] bg-[var(--mx-surface-container)]">
        <img
          src={getImageUrl(recipe.id)}
          alt={recipe.title}
          className="h-[300px] w-full object-cover md:h-[460px]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
          <p className="mb-3 inline-flex rounded-full bg-[var(--mx-secondary-container)] px-3 py-1 text-xs font-bold uppercase tracking-widest text-[var(--mx-secondary)]">
            {recipe.category || 'Rezept'}
          </p>
          <h2 className="text-3xl text-white md:text-5xl">{translation?.title || recipe.title}</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              to={`/cook/${recipe.id}`}
              className="rounded-full bg-[var(--mx-primary)] px-6 py-3 text-sm font-bold text-[var(--mx-on-primary)]"
            >
              Kochmodus starten
            </Link>
            <Link
              to="/"
              className="rounded-full bg-white/90 px-6 py-3 text-sm font-bold text-[var(--mx-primary)]"
            >
              Zurück zum Feed
            </Link>
          </div>
        </div>
      </section>

      {/* Controls Bar */}
      <div className="mx-glass flex flex-wrap items-center gap-2 justify-center rounded-[2rem] p-4">
        <button
          onClick={() => setShowEditModal(true)}
          className="rounded-full bg-[var(--mx-surface-high)] px-4 py-2 text-xs font-bold text-[var(--mx-on-surface)]"
        >
          ✏️ Bearbeiten
        </button>
        <button
          onClick={() => setShowTranslateModal(true)}
          className="rounded-full bg-[var(--mx-surface-high)] px-4 py-2 text-xs font-bold text-[var(--mx-on-surface)]"
        >
          🌍 Übersetzen
        </button>
        <button
          onClick={() => setShowNotesModal(true)}
          className="rounded-full bg-[var(--mx-surface-high)] px-4 py-2 text-xs font-bold text-[var(--mx-on-surface)]"
        >
          📝 Notizen
        </button>
        <button
          onClick={() => {
            const rating = recipe.rating === 1 ? null : 1
            updateMutation.mutate({
              recipeId: recipe.id,
              data: { rating },
            })
          }}
          className={`rounded-full px-4 py-2 text-xs font-bold ${
            recipe.rating === 1
              ? 'bg-[var(--mx-primary)] text-[var(--mx-on-primary)]'
              : 'bg-[var(--mx-surface-high)] text-[var(--mx-on-surface)]'
          }`}
        >
          ⭐ {recipe.rating === 1 ? 'Favorit' : 'Favorisieren'}
        </button>
        <button
          onClick={() => setConvertToMetric(!convertToMetric)}
          className={`rounded-full px-4 py-2 text-xs font-bold ${
            convertToMetric
              ? 'bg-[var(--mx-primary)] text-[var(--mx-on-primary)]'
              : 'bg-[var(--mx-surface-high)] text-[var(--mx-on-surface)]'
          }`}
        >
          📏 {convertToMetric ? 'Metrisch' : 'Imperial'}
        </button>
      </div>

      {/* Servings Adjustment */}
      {recipe.servings && (
        <div className="mx-glass rounded-[2rem] p-4 flex items-center justify-center gap-4">
          <span className="text-sm font-semibold text-[var(--mx-on-surface)]">
            {Math.round(recipe.servings * servingsMultiplier)} Portionen
          </span>
          <input
            type="range"
            min="0.5"
            max="4"
            step="0.5"
            value={servingsMultiplier}
            onChange={(e) => setServingsMultiplier(parseFloat(e.target.value))}
            className="w-32"
          />
          <span className="text-xs text-[var(--mx-on-surface-variant)]">
            {servingsMultiplier}x
          </span>
        </div>
      )}

      {/* Main Content Grid */}
      <section className="grid grid-cols-1 gap-8 lg:grid-cols-[360px_1fr]">
        {/* Ingredients Sidebar */}
        <aside className="rounded-[2rem] bg-[var(--mx-surface-low)] p-6 lg:sticky lg:top-26 lg:h-fit">
          <h3 className="text-2xl text-[var(--mx-on-surface)]">Zutaten</h3>
          <div className="mt-6 space-y-5">
            {[...groupedIngredients.entries()].map(([section, items]) => (
              <div
                key={section}
                className={`space-y-3 rounded-lg p-2 transition ${
                  highlightedIngredientId &&
                  items.some((i) => String(i.id) === highlightedIngredientId)
                    ? 'bg-[var(--mx-primary-container)]/30'
                    : ''
                }`}
              >
                <p className="text-xs font-bold uppercase tracking-widest text-[var(--mx-on-surface-variant)]">
                  {section}
                </p>
                <ul className="space-y-2 text-sm text-[var(--mx-on-surface)]">
                  {items.map((ingredient) => {
                    const displayAmount = convertToMetric
                      ? convertAmount(ingredient.amount || 0, ingredient.unit, 'g') ||
                        convertAmount(ingredient.amount || 0, ingredient.unit, 'ml') ||
                        ingredient.amount
                      : ingredient.amount

                    const displayUnit = convertToMetric
                      ? (ingredient.unit === 'cup' && 'ml') ||
                        (ingredient.unit === 'oz' && 'g') ||
                        (ingredient.unit === 'lb' && 'g') ||
                        (ingredient.unit === 'tbsp' && 'ml') ||
                        (ingredient.unit === 'tsp' && 'ml') ||
                        ingredient.unit
                      : ingredient.unit

                    return (
                      <li
                        key={ingredient.id}
                        onClick={() =>
                          setHighlightedIngredientId(
                            highlightedIngredientId === String(ingredient.id)
                              ? null
                              : String(ingredient.id),
                          )
                        }
                        className={`flex gap-2 cursor-pointer rounded p-1 transition ${
                          highlightedIngredientId === String(ingredient.id)
                            ? 'bg-[var(--mx-primary)] text-[var(--mx-on-primary)]'
                            : 'hover:bg-[var(--mx-surface-container)]'
                        }`}
                      >
                        <span className="mt-2 inline-block h-1.5 w-1.5 rounded-full bg-current flex-shrink-0" />
                        <span>
                          {displayAmount && Math.round(displayAmount * 100) / 100} {displayUnit} {ingredient.name}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </aside>

        {/* Instructions */}
        <section className="rounded-[2rem] bg-[var(--mx-surface-container)] p-6 md:p-8">
          <h3 className="text-3xl text-[var(--mx-on-surface)]">Anleitung</h3>
          <ol className="mt-8 space-y-8">
            {(() => {
              const stepsToDisplay = (translation?.steps ?? recipe.steps) as Array<{ id: string; text: string; time_minutes?: number | null }>
              return stepsToDisplay.map((step, index) => {
                const parts = parseIngredientReference(step.text)
                return (
                  <li key={step.id} className="relative pl-14">
                    <span className="absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--mx-primary)] text-sm font-bold text-[var(--mx-on-primary)]">
                      {index + 1}
                    </span>
                    <p className="leading-relaxed text-[var(--mx-on-surface-variant)] md:text-lg">
                      {parts.map((part, i) => {
                        if (part.type === 'text') {
                          return <span key={i}>{part.content}</span>
                        }
                        const ingredientId = part.content
                        const ingredient = Array.from(groupedIngredients.values())
                          .flat()
                          .find((ing) => String(ing.id) === ingredientId)
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() =>
                              setHighlightedIngredientId(
                                highlightedIngredientId === ingredientId ? null : ingredientId,
                              )
                            }
                            className={`rounded px-1 font-semibold transition ${
                              highlightedIngredientId === ingredientId
                                ? 'bg-[var(--mx-primary)] text-[var(--mx-on-primary)]'
                                : 'bg-[var(--mx-primary-container)]/40 text-[var(--mx-primary)] hover:bg-[var(--mx-primary-container)]/60'
                            }`}
                          >
                            {ingredient?.name || `Zutat #${ingredientId}`}
                          </button>
                        )
                      })}
                    </p>
                    {step.time_minutes ? (
                      <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-[var(--mx-primary)]">
                        {step.time_minutes} min
                      </p>
                    ) : null}
                  </li>
                )
              })
            })()}
          </ol>
        </section>
      </section>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-md rounded-[2rem] bg-[var(--mx-surface)] p-8">
            <h3 className="text-2xl font-bold text-[var(--mx-on-surface)]">Rezept bearbeiten</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const form = e.currentTarget
                const servingValue = parseInt(
                  (form.elements.namedItem('servings') as HTMLInputElement)?.value || '',
                )
                const updateData: RecipeUpdateData = {
                  title: (form.elements.namedItem('title') as HTMLInputElement)?.value || undefined,
                  servings: servingValue && servingValue > 0 ? servingValue : undefined,
                  category: (form.elements.namedItem('category') as HTMLInputElement)?.value || undefined,
                  prep_time: (form.elements.namedItem('prep_time') as HTMLInputElement)?.value || undefined,
                  cook_time: (form.elements.namedItem('cook_time') as HTMLInputElement)?.value || undefined,
                }
                updateMutation.mutate({ recipeId: recipe.id, data: updateData })
              }}
              className="mt-6 space-y-4"
            >
              <div>
                <label className="block text-sm font-semibold text-[var(--mx-on-surface)]">Titel</label>
                <input
                  name="title"
                  defaultValue={recipe.title}
                  className="mt-1 w-full rounded-lg border border-[var(--mx-outline-variant)] bg-[var(--mx-surface-container)] px-3 py-2 text-[var(--mx-on-surface)]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--mx-on-surface)]">Portionen</label>
                <input
                  name="servings"
                  type="number"
                  defaultValue={recipe.servings || ''}
                  className="mt-1 w-full rounded-lg border border-[var(--mx-outline-variant)] bg-[var(--mx-surface-container)] px-3 py-2 text-[var(--mx-on-surface)]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--mx-on-surface)]">Kategorie</label>
                <input
                  name="category"
                  defaultValue={recipe.category || ''}
                  className="mt-1 w-full rounded-lg border border-[var(--mx-outline-variant)] bg-[var(--mx-surface-container)] px-3 py-2 text-[var(--mx-on-surface)]"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 rounded-full bg-[var(--mx-surface-high)] px-4 py-2 text-sm font-bold text-[var(--mx-on-surface)]"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="flex-1 rounded-full bg-[var(--mx-primary)] px-4 py-2 text-sm font-bold text-[var(--mx-on-primary)] disabled:opacity-50"
                >
                  {updateMutation.isPending ? 'Speichert …' : 'Speichern'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Translate Modal */}
      {showTranslateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-md rounded-[2rem] bg-[var(--mx-surface)] p-8">
            <h3 className="text-2xl font-bold text-[var(--mx-on-surface)]">Übersetzen</h3>
            <div className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[var(--mx-on-surface)]">Sprache</label>
                <select
                  value={translateLang}
                  onChange={(e) => setTranslateLang(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--mx-outline-variant)] bg-[var(--mx-surface-container)] px-3 py-2 text-[var(--mx-on-surface)]"
                >
                  <option value="de">Deutsch</option>
                  <option value="en">English</option>
                  <option value="it">Italiano</option>
                  <option value="fr">Français</option>
                  <option value="es">Español</option>
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowTranslateModal(false)}
                  className="flex-1 rounded-full bg-[var(--mx-surface-high)] px-4 py-2 text-sm font-bold text-[var(--mx-on-surface)]"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleTranslate}
                  disabled={translateMutation.isPending}
                  className="flex-1 rounded-full bg-[var(--mx-primary)] px-4 py-2 text-sm font-bold text-[var(--mx-on-primary)] disabled:opacity-50"
                >
                  {translateMutation.isPending ? 'Übersetzt …' : 'Übersetzen'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notes Modal */}
      {showNotesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-md rounded-[2rem] bg-[var(--mx-surface)] p-8">
            <h3 className="text-2xl font-bold text-[var(--mx-on-surface)]">Notizen</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const notes = (e.currentTarget.elements.namedItem('notes') as HTMLTextAreaElement)?.value || ''
                const notesData: RecipeUpdateData = { notes }
                updateMutation.mutate({ recipeId: recipe.id, data: notesData })
              }}
              className="mt-6 space-y-4"
            >
              <textarea
                name="notes"
                defaultValue={recipe.notes || ''}
                placeholder="Notizen zum Rezept …"
                rows={5}
                className="w-full rounded-lg border border-[var(--mx-outline-variant)] bg-[var(--mx-surface-container)] px-3 py-2 text-[var(--mx-on-surface)]"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowNotesModal(false)}
                  className="flex-1 rounded-full bg-[var(--mx-surface-high)] px-4 py-2 text-sm font-bold text-[var(--mx-on-surface)]"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="flex-1 rounded-full bg-[var(--mx-primary)] px-4 py-2 text-sm font-bold text-[var(--mx-on-primary)] disabled:opacity-50"
                >
                  {updateMutation.isPending ? 'Speichert …' : 'Speichern'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
