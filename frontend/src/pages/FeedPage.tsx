import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { flushSync } from 'react-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { getImageUrl, getRecipes } from '../lib/api'
import { useCategories } from '../lib/useCategories'
import { HeartIcon, RecipeCard } from '../components/RecipeCard'
import { categoryChipCls, getCategoryIcon } from '../lib/categoryUtils'
import { useNavDrawer } from '../context/useNavDrawer'

interface CategoryNavProps {
  categories: string[]
  categoryCounts: Record<string, number>
  selectedMainCategory: string | null
  recipesCount: number
  onSelect: (cat: string | null) => void
  catBtnCls: (cat: string | null, active: boolean) => string
}

function CategoryNav({
  categories,
  categoryCounts,
  selectedMainCategory,
  recipesCount,
  onSelect,
  catBtnCls,
}: CategoryNavProps) {
  return (
    <>
      <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--mx-on-surface-variant)]">Kategorien</p>
      <button onClick={() => onSelect(null)} className={catBtnCls(null, !selectedMainCategory)}>
        <span>Alle</span>
        <span className="text-xs opacity-60">{recipesCount}</span>
      </button>
      {categories.map((cat) => (
        <button key={cat} onClick={() => onSelect(cat)} className={catBtnCls(cat, selectedMainCategory === cat)}>
          <span>{cat}</span>
          {categoryCounts[cat] != null && <span className="text-xs opacity-60">{categoryCounts[cat]}</span>}
        </button>
      ))}
    </>
  )
}

const PAGE_SIZE = 20

interface FeedPageProps {
  scrollPositions: Record<string, number>
}

export function FeedPage(_: FeedPageProps) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [selectedMainCategory, setSelectedMainCategory] = useState<string | null>(null)
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [heroIndex, setHeroIndex] = useState(0)
  const [heroImgOk, setHeroImgOk] = useState(true)
  const { open: drawerOpen, setOpen: setDrawerOpen } = useNavDrawer()
  const mainRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const prevRecipeIdsRef = useRef<Set<string>>(new Set())
  const [animatingCardIds, setAnimatingCardIds] = useState<string[]>([])

  const categoriesQuery = useCategories()
  const recipesQuery = useInfiniteQuery({
    queryKey: ['recipes'],
    queryFn: ({ pageParam }) => getRecipes(PAGE_SIZE, pageParam as number),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined
      return allPages.reduce((sum, page) => sum + page.length, 0)
    },
    refetchInterval: 30_000,
  })

  const allRecipes = useMemo(() => recipesQuery.data?.pages.flat() ?? [], [recipesQuery.data])

  // Rotate hero every 5s through first 6 recipes
  useEffect(() => {
    const total = Math.min(allRecipes.length, 6)
    if (total <= 1) return
    const id = setInterval(() => {
      setHeroIndex(i => (i + 1) % total)
      setHeroImgOk(true)
    }, 5000)
    return () => clearInterval(id)
  }, [allRecipes.length])

  // Close drawer on scroll
  useEffect(() => {
    if (!drawerOpen) return
    const el = mainRef.current
    if (!el) return
    const onScroll = () => setDrawerOpen(false)
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('scroll', onScroll)
    }
  }, [drawerOpen, setDrawerOpen])

  // Infinite scroll: load next page when sentinel enters viewport
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && recipesQuery.hasNextPage && !recipesQuery.isFetchingNextPage) {
          void recipesQuery.fetchNextPage()
        }
      },
      { rootMargin: '300px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [recipesQuery.hasNextPage, recipesQuery.isFetchingNextPage, recipesQuery.fetchNextPage])

  const heroRecipe = allRecipes[heroIndex]

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of allRecipes) {
      if (r.category) counts[r.category] = (counts[r.category] ?? 0) + 1
    }
    return counts
  }, [allRecipes])

  const availableTags = useMemo(() => {
    const tags = new Set<string>()
    for (const r of allRecipes) {
      if (!selectedMainCategory || r.category === selectedMainCategory) {
        for (const t of r.tags ?? []) tags.add(t)
      }
    }
    return Array.from(tags).sort()
  }, [allRecipes, selectedMainCategory])

  const filteredRecipes = useMemo(() => {
    const value = search.trim().toLowerCase()
    return allRecipes.filter((recipe) => {
      const titleMatch = recipe.title.toLowerCase().includes(value)
      const tagMatch = recipe.tags?.some((t) => t.toLowerCase().includes(value))
      const categoryMatch = recipe.category?.toLowerCase().includes(value)
      const searchOk = !value || titleMatch || tagMatch || categoryMatch
      const mainCatOk = !selectedMainCategory || recipe.category === selectedMainCategory
      const tagOk = selectedTags.size === 0 || recipe.tags?.some((t) => selectedTags.has(t))
      const favoriteOk = !showFavoritesOnly || recipe.rating === 1
      return searchOk && mainCatOk && tagOk && favoriteOk
    })
  }, [allRecipes, search, selectedMainCategory, selectedTags, showFavoritesOnly])

  // Track new and removed cards for animations
  useEffect(() => {
    const currentIds = new Set(filteredRecipes.map(r => r.id))
    const prevIds = prevRecipeIdsRef.current

    // Cards that are new (in current but not in previous)
    const newCardIds = new Set<string>()
    currentIds.forEach(id => {
      if (!prevIds.has(id)) {
        newCardIds.add(id)
      }
    })

    // Cards that were removed (in previous but not in current)
    const removedCardIds = new Set<string>()
    prevIds.forEach(id => {
      if (!currentIds.has(id)) {
        removedCardIds.add(id)
      }
    })

    // Update animating cards set to include both new and removed
    let timer: ReturnType<typeof setTimeout> | undefined
    if (newCardIds.size > 0 || removedCardIds.size > 0) {
      const combined = new Set([...newCardIds, ...removedCardIds])
      setAnimatingCardIds(Array.from(combined))

      // Clear animation state after the animation completes (300ms)
      timer = setTimeout(() => {
        setAnimatingCardIds([])
      }, 300)
    }

    prevRecipeIdsRef.current = currentIds

    return () => {
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [filteredRecipes])

  const handleMainCat = (cat: string | null) => {
    setSelectedMainCategory(cat)
    setSelectedTags(new Set())
    setShowFavoritesOnly(false)
    setDrawerOpen(false)
  }

  const catBtnCls = (cat: string | null, active: boolean) => {
    if (!active) return 'flex w-full items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition text-[var(--mx-on-surface)] hover:bg-[var(--mx-surface-container)]'
    const colors: Record<string, string> = {
      'Vorspeisen':   'bg-[var(--cat-vorspeisen-bg)] text-[var(--cat-vorspeisen-text)]',
      'Hauptspeisen': 'bg-[var(--cat-hauptspeisen-bg)] text-[var(--cat-hauptspeisen-text)]',
      'Desserts':     'bg-[var(--cat-desserts-bg)] text-[var(--cat-desserts-text)]',
      'Brunch':       'bg-[var(--cat-brunch-bg)] text-[var(--cat-brunch-text)]',
      'Snacks':       'bg-[var(--cat-snacks-bg)] text-[var(--cat-snacks-text)]',
      'Drinks':       'bg-[var(--cat-drinks-bg)] text-[var(--cat-drinks-text)]',
    }
    const color = cat ? (colors[cat] ?? 'bg-[var(--mx-primary)] text-[var(--mx-on-primary)]') : 'bg-[var(--mx-primary)] text-[var(--mx-on-primary)]'
    return `flex w-full items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${color}`
  }

  return (
    <div ref={mainRef} className="flex flex-col gap-6 lg:flex-row lg:items-start">

      {/* ── Mobile drawer backdrop ── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* ── Mobile slide-in drawer ── */}
      <div
        className={`fixed inset-y-0 left-0 z-40 w-72 bg-[var(--mx-surface)] shadow-2xl transition-transform duration-300 ease-in-out lg:hidden ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-[var(--mx-outline-variant)]/20 px-5 py-5">
          <span className="font-headline text-lg font-bold text-[var(--mx-on-surface)]">Kategorien</span>
          <button
            onClick={() => setDrawerOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--mx-on-surface-variant)] hover:bg-[var(--mx-surface-container)] transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <nav className="space-y-1 p-4">
          <CategoryNav
            categories={categoriesQuery.data ?? []}
            categoryCounts={categoryCounts}
            selectedMainCategory={selectedMainCategory}
            recipesCount={allRecipes.length}
            onSelect={handleMainCat}
            catBtnCls={catBtnCls}
          />
        </nav>
      </div>

      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:block lg:sticky lg:top-28 lg:w-52 lg:flex-shrink-0">
        <nav className="rounded-[2rem] bg-[var(--mx-surface-low)] p-4 space-y-1">
          <CategoryNav
            categories={categoriesQuery.data ?? []}
            categoryCounts={categoryCounts}
            selectedMainCategory={selectedMainCategory}
            recipesCount={allRecipes.length}
            onSelect={handleMainCat}
            catBtnCls={catBtnCls}
          />
        </nav>
      </aside>

      {/* ── Main ── */}
      <div className="min-w-0 flex-1 space-y-5">

        {/* ROTATING HERO */}
        {heroRecipe && (
          <section>
            <div
              onClick={() => {
                const target = `/recipes/${heroRecipe.slug || heroRecipe.id}`
                if ('startViewTransition' in document) {
                  document.documentElement.dataset.navdir = 'forward'
                  ;(document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(() => {
                    flushSync(() => navigate(target))
                  })
                } else {
                  navigate(target)
                }
              }}
              role="link"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const target = `/recipes/${heroRecipe.slug || heroRecipe.id}`
                  if ('startViewTransition' in document) {
                    document.documentElement.dataset.navdir = 'forward'
                    ;(document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(() => {
                      flushSync(() => navigate(target))
                    })
                  } else {
                    navigate(target)
                  }
                }
              }}
              className="group relative w-full cursor-pointer overflow-hidden rounded-[2.5rem]"
              style={{ aspectRatio: '21/9' }}>
              {heroImgOk ? (
                <img
                  key={heroIndex}
                  src={getImageUrl(heroRecipe.id)}
                  alt={heroRecipe.title}
                  onError={() => setHeroImgOk(false)}
                  className="h-full w-full object-cover transition-transform duration-1000 group-hover:scale-105"
                  style={{ animation: 'mx-fadein 0.6s ease-out' }}
                />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-[var(--mx-primary-container)] to-[var(--mx-secondary-container)]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 flex w-full flex-col items-start gap-4 p-5 md:p-8">
                <div className="max-w-xl">
                  {heroRecipe.category && (
                    <span className={`mb-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] backdrop-blur-md md:text-xs ${categoryChipCls(heroRecipe.category)}`}>
                      <span className="material-symbols-outlined text-[10px]">{getCategoryIcon(heroRecipe.category)}</span>
                      {heroRecipe.category}
                    </span>
                  )}
                  <h2 className="font-headline text-2xl font-bold leading-[1.1] text-white md:text-4xl">
                    {heroRecipe.title}
                  </h2>
                  {(heroRecipe.tags?.length ?? 0) > 0 && (
                    <div className="mt-2 hidden flex-wrap gap-1.5 sm:flex">
                      {heroRecipe.tags!.slice(0, 4).map(tag => (
                        <span key={tag} className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] text-white/80 backdrop-blur-sm">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Dot indicators */}
            {allRecipes.length > 1 && (
              <div className="mt-3 flex justify-center gap-1.5">
                {Array.from({ length: Math.min(allRecipes.length, 6) }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => { setHeroIndex(i); setHeroImgOk(true) }}
                    className={`h-1.5 rounded-full transition-all duration-300 ${i === heroIndex ? 'w-5 bg-[var(--mx-primary)]' : 'w-1.5 bg-[var(--mx-outline-variant)]'}`}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* SEARCH + HAMBURGER (mobile) + TAG FILTERS + FAVORITES */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">

            <div className="mx-glass flex flex-1 items-center rounded-full px-4 py-2">
              <span className="material-symbols-outlined mr-2 flex-shrink-0 text-[18px] text-[var(--mx-on-surface-variant)]">search</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Suche nach Titel oder Tag ..."
                className="w-full bg-transparent py-1.5 text-sm text-[var(--mx-on-surface)] outline-none placeholder:text-[var(--mx-on-surface-variant)]"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Favorites filter */}
            <button
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
                showFavoritesOnly
                  ? 'bg-[var(--mx-primary)] text-[var(--mx-on-primary)]'
                  : 'bg-[var(--mx-surface-container)] text-[var(--mx-on-surface-variant)] hover:text-[var(--mx-on-surface)]'
              }`}
            >
              <HeartIcon filled={showFavoritesOnly} className="h-3 w-3" />
              Favoriten
            </button>

            {availableTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTags((prev) => {
                  const next = new Set(prev)
                  if (next.has(tag)) {
                    next.delete(tag)
                  } else {
                    next.add(tag)
                  }
                  return next
                })}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  selectedTags.has(tag)
                    ? 'bg-[var(--mx-secondary-container)] text-[var(--mx-secondary)]'
                    : 'bg-[var(--mx-surface-container)] text-[var(--mx-on-surface-variant)] hover:text-[var(--mx-on-surface)]'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {recipesQuery.isLoading && (
          <div className="rounded-[2rem] bg-[var(--mx-surface-low)] p-10 text-center text-[var(--mx-on-surface-variant)]">
            Lade Rezepte ...
          </div>
        )}

        {/* Error */}
        {recipesQuery.error && (
          <div className="rounded-[2rem] bg-red-100/70 p-10 text-center text-red-800">
            Rezepte konnten nicht geladen werden.
          </div>
        )}

        {/* Grid */}
        {!recipesQuery.isLoading && !recipesQuery.error && (
          <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
            {filteredRecipes.map((recipe, index) => {
              const isAnimating = animatingCardIds.includes(recipe.id)
              const animationClass = isAnimating ? 'mx-card-enter' : ''
              return (
                <div key={recipe.id} className={animationClass}>
                  <RecipeCard recipe={recipe} index={index} />
                </div>
              )
            })}
          </section>
        )}

        {/* Infinite scroll sentinel & loader */}
        <div ref={sentinelRef} className="h-1" />
        {recipesQuery.isFetchingNextPage && (
          <div className="py-8 text-center">
            <span className="material-symbols-outlined text-[28px] text-[var(--mx-primary)]" style={{ animation: 'spin 1s linear infinite' }}>progress_activity</span>
          </div>
        )}

        {/* Empty state */}
        {!recipesQuery.isLoading && !recipesQuery.error && filteredRecipes.length === 0 && (
          <div className="rounded-[2rem] bg-[var(--mx-surface-low)] p-10 text-center text-[var(--mx-on-surface-variant)]">
            {search ? `Keine Treffer f\u00fcr \u201e${search}\u201c` : 'Keine Rezepte in dieser Kategorie.'}
          </div>
        )}
      </div>
    </div>
  )
}
