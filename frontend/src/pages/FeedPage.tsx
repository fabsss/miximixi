import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { flushSync } from 'react-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { getImageUrl, getRecipes, getTags, getHeroRecipes } from '../lib/api'
import { useCategories, useCategoryCounts } from '../lib/useCategories'
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

export function FeedPage(): ReactNode {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('q') ?? ''
  const selectedMainCategory = searchParams.get('cat') || null
  const selectedTags = useMemo(() => new Set(searchParams.getAll('tag')), [searchParams])
  const showFavoritesOnly = searchParams.get('fav') === '1'
  const [heroIndex, setHeroIndex] = useState(0)
  const [heroImgOk, setHeroImgOk] = useState(true)
  const { open: drawerOpen, setOpen: setDrawerOpen } = useNavDrawer()
  const mainRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const prevRecipeIdsRef = useRef<Set<string>>(new Set())
  const [animatingCardIds, setAnimatingCardIds] = useState<string[]>([])
  const [removedAnimatingIds, setRemovedAnimatingIds] = useState<string[]>([])

  const categoriesQuery = useCategories()
  const categoryCountsQuery = useCategoryCounts()

  // Hero query: only category-filtered, ignores search/tags/favorites
  const heroQuery = useQuery({
    queryKey: ['heroRecipes', selectedMainCategory],
    queryFn: () => getHeroRecipes(6, selectedMainCategory || undefined),
  })
  const heroRecipes = heroQuery.data ?? []

  const recipesQuery = useInfiniteQuery({
    queryKey: ['recipes', { q: search, category: selectedMainCategory, tags: Array.from(selectedTags), fav: showFavoritesOnly }],
    queryFn: ({ pageParam }) => getRecipes(PAGE_SIZE, pageParam as number, {
      q: search,
      category: selectedMainCategory || undefined,
      tags: Array.from(selectedTags),
      favorites: showFavoritesOnly,
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined
      return allPages.reduce((sum, page) => sum + page.length, 0)
    },
    refetchInterval: 30_000,
  })

  const allRecipes = useMemo(() => recipesQuery.data?.pages.flat() ?? [], [recipesQuery.data])

  // Rotate hero every 5s through first 6 recipes (from hero query only, not filtered search)
  useEffect(() => {
    const total = Math.min(heroRecipes.length, 6)
    if (total <= 1) return
    const id = setInterval(() => {
      setHeroIndex(i => (i + 1) % total)
      setHeroImgOk(true)
    }, 5000)
    return () => clearInterval(id)
  }, [heroRecipes.length])

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipesQuery.hasNextPage, recipesQuery.isFetchingNextPage, recipesQuery.fetchNextPage])

  const heroRecipe = heroRecipes[heroIndex]

  const categoryCounts = categoryCountsQuery.data?.counts ?? {}

  // Fetch all tags from DB (optionally filtered by category)
  const tagsQuery = useQuery({
    queryKey: ['tags', selectedMainCategory],
    queryFn: () => getTags(selectedMainCategory || undefined),
  })

  const availableTags = useMemo(() => {
    // Convert flat list to [lowercase, displayLabel] entries for consistency
    return (tagsQuery.data ?? []).map(tag => [tag.toLowerCase(), tag] as [string, string])
  }, [tagsQuery.data])

  // Track new and removed cards for animations
  useEffect(() => {
    const currentIds = new Set(allRecipes.map(r => r.id))
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

    prevRecipeIdsRef.current = currentIds

    // Update animating cards set to include new cards with enter animation
    // Use microtask to defer state update outside the effect synchronous phase
    let enterTimer: ReturnType<typeof setTimeout> | undefined
    let exitTimer: ReturnType<typeof setTimeout> | undefined
    if (newCardIds.size > 0 || removedCardIds.size > 0) {
      queueMicrotask(() => {
        // Handle removed cards with exit animation (200ms)
        if (removedCardIds.size > 0) {
          setRemovedAnimatingIds(Array.from(removedCardIds))
          exitTimer = setTimeout(() => {
            setRemovedAnimatingIds([])
          }, 200)
        }

        // Handle new cards with enter animation (300ms)
        if (newCardIds.size > 0) {
          setAnimatingCardIds(Array.from(newCardIds))
          enterTimer = setTimeout(() => {
            setAnimatingCardIds([])
          }, 300)
        }
      })
    }

    return () => {
      if (enterTimer !== undefined) clearTimeout(enterTimer)
      if (exitTimer !== undefined) clearTimeout(exitTimer)
    }
  }, [allRecipes])

  // Scroll to top on major filter changes, but NOT on tag toggle (user may be mid-scroll selecting tags)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [selectedMainCategory, showFavoritesOnly, search])

  const handleMainCat = (cat: string | null) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (cat) next.set('cat', cat)
      else next.delete('cat')
      next.delete('tag')
      next.delete('fav')
      return next
    }, { replace: true })
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
            recipesCount={categoryCountsQuery.data?.total ?? allRecipes.length}
            onSelect={handleMainCat}
            catBtnCls={catBtnCls}
          />
          <hr className="my-2 border-[var(--mx-outline-variant)]/20" />
          <Link
            to="/tags"
            onClick={() => setDrawerOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-[var(--mx-on-surface-variant)] hover:bg-[var(--mx-surface-container)] transition"
          >
            <span className="material-symbols-outlined text-[18px]">sell</span>
            <span>Tags</span>
          </Link>
        </nav>
      </div>

      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:block lg:sticky lg:top-28 lg:w-52 lg:flex-shrink-0">
        <nav className="rounded-[2rem] bg-[var(--cat-sidebar-bg)] p-4 space-y-1">
          <CategoryNav
            categories={categoriesQuery.data ?? []}
            categoryCounts={categoryCounts}
            selectedMainCategory={selectedMainCategory}
            recipesCount={categoryCountsQuery.data?.total ?? allRecipes.length}
            onSelect={handleMainCat}
            catBtnCls={catBtnCls}
          />
          <hr className="my-2 border-[var(--mx-outline-variant)]/20" />
          <Link
            to="/tags"
            className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-[var(--mx-on-surface-variant)] hover:bg-[var(--mx-surface-container)] transition"
          >
            <span className="material-symbols-outlined text-[18px]">sell</span>
            <span>Tags</span>
          </Link>
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
            {heroRecipes.length > 1 && (
              <div className="mt-3 flex justify-center gap-1.5">
                {Array.from({ length: Math.min(heroRecipes.length, 6) }, (_, i) => (
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
                onChange={(e) => {
                  const value = e.target.value
                  setSearchParams(prev => {
                    const next = new URLSearchParams(prev)
                    if (value) next.set('q', value)
                    else next.delete('q')
                    return next
                  }, { replace: true })
                }}
                placeholder="Suche nach Titel oder Tag ..."
                className="w-full bg-transparent py-1.5 text-sm text-[var(--mx-on-surface)] outline-none placeholder:text-[var(--mx-on-surface-variant)]"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Favorites filter */}
            <button
              onClick={() => setSearchParams(prev => {
                const next = new URLSearchParams(prev)
                if (next.get('fav') === '1') next.delete('fav')
                else next.set('fav', '1')
                return next
              }, { replace: true })}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
                showFavoritesOnly
                  ? 'bg-[var(--mx-primary)] text-[var(--mx-on-primary)]'
                  : 'bg-[var(--mx-surface-container)] text-[var(--mx-on-surface-variant)] hover:text-[var(--mx-on-surface)]'
              }`}
            >
              <HeartIcon filled={showFavoritesOnly} className="h-3 w-3" />
              Favoriten
            </button>

            {availableTags.map(([tagKey, tagDisplay]) => (
              <button
                key={tagKey}
                onClick={() => setSearchParams(prev => {
                  const next = new URLSearchParams(prev)
                  const current = next.getAll('tag')
                  next.delete('tag')
                  if (current.includes(tagKey)) {
                    current.filter(t => t !== tagKey).forEach(t => next.append('tag', t))
                  } else {
                    [...current, tagKey].forEach(t => next.append('tag', t))
                  }
                  return next
                }, { replace: true })}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  selectedTags.has(tagKey)
                    ? 'bg-[var(--mx-secondary-container)] text-[var(--mx-secondary)]'
                    : 'bg-[var(--mx-surface-container)] text-[var(--mx-on-surface-variant)] hover:text-[var(--mx-on-surface)]'
                }`}
              >
                {tagDisplay}
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
            {allRecipes.map((recipe, index) => {
              const isAnimating = animatingCardIds.includes(recipe.id)
              const animationClass = isAnimating ? 'mx-card-enter' : ''
              return (
                <div key={recipe.id} className={animationClass}>
                  <RecipeCard recipe={recipe} index={index} />
                </div>
              )
            })}
            {/* Removed cards with exit animation */}
            {removedAnimatingIds.map((id) => {
              // Find the recipe from allRecipes to still render it during exit animation
              const recipe = allRecipes.find(r => r.id === id)
              if (!recipe) return null
              // Use a stable index to keep consistency during animation
              const index = allRecipes.indexOf(recipe)
              return (
                <div key={`removed-${id}`} className="mx-card-exit">
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
        {!recipesQuery.isLoading && !recipesQuery.error && allRecipes.length === 0 && (
          <div className="rounded-[2rem] bg-[var(--mx-surface-low)] p-10 text-center text-[var(--mx-on-surface-variant)]">
            {search ? `Keine Treffer f\u00fcr \u201e${search}\u201c` : 'Keine Rezepte in dieser Kategorie.'}
          </div>
        )}
      </div>
    </div>
  )
}
