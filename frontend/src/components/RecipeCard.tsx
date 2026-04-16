import { useNavigate } from 'react-router-dom'
import { flushSync } from 'react-dom'
import { getImageUrl } from '../lib/api'
import { categoryChipCls, getCategoryIcon } from '../lib/categoryUtils'
import type { RecipeListItem } from '../types'

interface RecipeCardProps {
  recipe: RecipeListItem
  index: number
}

const tileVariants = ['aspect-[4/3]', 'aspect-[3/2]', 'aspect-[16/10]']

function HeartIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
    >
      {filled ? (
        <path
          fill="currentColor"
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        />
      ) : (
        <path
          fill="currentColor"
          d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"
        />
      )}
    </svg>
  )
}

export function RecipeCard({ recipe, index }: RecipeCardProps) {
  const navigate = useNavigate()
  const imageUrl = getImageUrl(recipe.id)
  const tileClass = tileVariants[index % tileVariants.length]
  const isFavorite = recipe.rating === 1
  const categories = recipe.category
    ? recipe.category.split(',').map((c) => c.trim()).filter(Boolean)
    : []

  const handleClick = () => {
    const target = `/recipes/${recipe.slug || recipe.id}`
    if ('startViewTransition' in document) {
      document.documentElement.dataset.navdir = 'forward'
      ;(document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(() => {
        flushSync(() => navigate(target))
      })
    } else {
      navigate(target)
    }
  }

  return (
    <div role="link" tabIndex={0} onClick={handleClick} onKeyDown={(e) => e.key === 'Enter' && handleClick()} className="group block cursor-pointer">
      <article className="rounded-[2rem] bg-[var(--mx-surface-container)] p-3 transition duration-500 hover:translate-y-[-2px] hover:shadow-[0_24px_52px_var(--mx-glow)]">
        <div className={`relative overflow-hidden rounded-[1.6rem] ${tileClass}`}>
          <img
            src={imageUrl}
            alt={recipe.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
          />
          {/* Overlay with button */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent flex items-end justify-center pb-4">
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleClick()
              }}
              className="flex items-center gap-2 rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-black/20 transition-all hover:bg-amber-800 active:scale-95"
            >
              <span className="material-symbols-outlined text-[17px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                restaurant
              </span>
              Zum Rezept
            </button>
          </div>
          {/* Favorite heart – top left */}
          {isFavorite && (
            <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--mx-primary)] text-[var(--mx-on-primary)]">
              <HeartIcon filled className="h-4 w-4" />
            </span>
          )}
          {/* Category chips – bottom left inside image */}
          {categories.length > 0 && (
            <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1">
              {categories.map((cat) => (
                <span key={cat} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide backdrop-blur-md ${categoryChipCls(cat)}`}>
                  <span className="material-symbols-outlined text-[10px]">{getCategoryIcon(cat)}</span>
                  {cat}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="px-2 pb-1 pt-3">
          <h3 className="text-base font-bold text-[var(--mx-on-surface)] transition group-hover:text-[var(--mx-primary)]">
            {recipe.title}
          </h3>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {recipe.tags?.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="inline-block rounded-full bg-[var(--mx-surface-high)] px-2 py-0.5 text-[11px] font-semibold text-[var(--mx-on-surface-variant)]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </article>
    </div>
  )
}

export { HeartIcon }
