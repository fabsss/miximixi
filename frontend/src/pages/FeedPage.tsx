import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRecipes } from '../lib/api'
import { RecipeCard } from '../components/RecipeCard'

export function FeedPage() {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const recipesQuery = useQuery({
    queryKey: ['recipes'],
    queryFn: () => getRecipes(80),
  })

  const categories = useMemo(() => {
    const cats = new Set(
      (recipesQuery.data ?? [])
        .map((r) => r.category)
        .filter(Boolean),
    )
    return Array.from(cats).sort()
  }, [recipesQuery.data])

  const filteredRecipes = useMemo(() => {
    const value = search.trim().toLowerCase()
    return (recipesQuery.data ?? []).filter((recipe) => {
      const titleMatch = recipe.title.toLowerCase().includes(value)
      const categoryMatch = recipe.category?.toLowerCase().includes(value)
      const searchOk = !value || titleMatch || categoryMatch
      const categoryOk = !selectedCategory || recipe.category === selectedCategory
      return searchOk && categoryOk
    })
  }, [recipesQuery.data, search, selectedCategory])

  return (
    <div className="space-y-9">
      <section className="relative overflow-hidden rounded-[2.5rem] bg-[var(--mx-surface-container)] p-8 md:p-12">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--mx-primary-container)]/35 via-transparent to-[var(--mx-secondary-container)]/30" />
        <div className="relative max-w-3xl">
          <p className="mb-3 inline-flex rounded-full bg-[var(--mx-primary)] px-4 py-1 text-xs font-bold uppercase tracking-[0.22em] text-[var(--mx-on-primary)]">
            Rezeptsammlung
          </p>
          <h2 className="text-4xl leading-tight text-[var(--mx-on-surface)] md:text-6xl">
            Redaktionelle Rezepte direkt aus der Pipeline.
          </h2>
          <p className="mt-4 text-[var(--mx-on-surface-variant)] md:text-lg">
            Suche nach Titel oder Kategorie. Jede Rezeptsammelkarte öffnet eine detaillierte Leseansicht und den Kochmodus.
          </p>
        </div>
      </section>

      <div className="space-y-3">
        <div className="mx-glass flex items-center rounded-full px-4 py-2">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rezepte durchsuchen …"
            className="w-full bg-transparent px-3 py-2 text-sm text-[var(--mx-on-surface)] outline-none placeholder:text-[var(--mx-on-surface-variant)]"
          />
        </div>

        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                selectedCategory === null
                  ? 'bg-[var(--mx-primary)] text-[var(--mx-on-primary)]'
                  : 'bg-[var(--mx-surface-container)] text-[var(--mx-on-surface-variant)] hover:text-[var(--mx-on-surface)]'
              }`}
            >
              Alle
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  selectedCategory === cat
                    ? 'bg-[var(--mx-primary)] text-[var(--mx-on-primary)]'
                    : 'bg-[var(--mx-surface-container)] text-[var(--mx-on-surface-variant)] hover:text-[var(--mx-on-surface)]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {recipesQuery.isLoading ? (
        <div className="rounded-[2rem] bg-[var(--mx-surface-low)] p-10 text-center text-[var(--mx-on-surface-variant)]">
          Lade Rezepte …
        </div>
      ) : null}

      {recipesQuery.error ? (
        <div className="rounded-[2rem] bg-red-100/70 p-10 text-center text-red-800">
          Rezepte konnten nicht geladen werden.
        </div>
      ) : null}

      {!recipesQuery.isLoading && !recipesQuery.error ? (
        <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredRecipes.map((recipe, index) => (
            <RecipeCard key={recipe.id} recipe={recipe} index={index} />
          ))}
        </section>
      ) : null}

      {!recipesQuery.isLoading && !recipesQuery.error && filteredRecipes.length === 0 ? (
        <div className="rounded-[2rem] bg-[var(--mx-surface-low)] p-10 text-center text-[var(--mx-on-surface-variant)]">
          Keine Treffer für &quot;{search}&quot;
          {selectedCategory && ` in "${selectedCategory}"`}.
        </div>
      ) : null}
    </div>
  )
}
