import { Link } from 'react-router-dom'
import { getImageUrl } from '../lib/api'
import type { RecipeListItem } from '../types'

interface RecipeCardProps {
  recipe: RecipeListItem
  index: number
}

const tileVariants = ['aspect-[4/5]', 'aspect-[3/4]', 'aspect-[1/1]']

export function RecipeCard({ recipe, index }: RecipeCardProps) {
  const imageUrl = getImageUrl(recipe.id)
  const source = recipe.source_label || 'Sammlung'
  const tileClass = tileVariants[index % tileVariants.length]

  return (
    <Link to={`/recipes/${recipe.id}`} className="group block">
      <article className="rounded-[2rem] bg-[var(--mx-surface-container)] p-3 transition duration-500 hover:translate-y-[-2px] hover:shadow-[0_24px_52px_var(--mx-glow)]">
        <div className={`relative overflow-hidden rounded-[1.6rem] ${tileClass}`}>
          <img
            src={imageUrl}
            alt={recipe.title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
          />
          <span className="mx-glass absolute right-3 top-3 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[var(--mx-primary)]">
            {source}
          </span>
        </div>

        <div className="px-2 pb-1 pt-5">
          <h3 className="text-xl font-bold text-[var(--mx-on-surface)] transition group-hover:text-[var(--mx-primary)]">
            {recipe.title}
          </h3>
          {recipe.category ? (
            <p className="mt-2 inline-block rounded-full bg-[var(--mx-secondary-container)] px-3 py-1 text-xs font-semibold text-[var(--mx-secondary)]">
              {recipe.category}
            </p>
          ) : null}
        </div>
      </article>
    </Link>
  )
}
