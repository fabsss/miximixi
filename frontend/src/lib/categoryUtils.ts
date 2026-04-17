/**
 * Returns CSS class for category background and text color.
 * Colors are defined as CSS variables in index.css – SINGLE SOURCE OF TRUTH.
 * Automatically uses pastel colors in light mode, darker colors in dark mode.
 */
export function categoryChipCls(cat: string): string {
  switch (cat.toLowerCase()) {
    case 'vorspeisen':   return 'bg-[var(--cat-vorspeisen-bg)] text-[var(--cat-vorspeisen-text)]'
    case 'hauptspeisen': return 'bg-[var(--cat-hauptspeisen-bg)] text-[var(--cat-hauptspeisen-text)]'
    case 'desserts':     return 'bg-[var(--cat-desserts-bg)] text-[var(--cat-desserts-text)]'
    case 'brunch':       return 'bg-[var(--cat-brunch-bg)] text-[var(--cat-brunch-text)]'
    case 'snacks':       return 'bg-[var(--cat-snacks-bg)] text-[var(--cat-snacks-text)]'
    case 'drinks':       return 'bg-[var(--cat-drinks-bg)] text-[var(--cat-drinks-text)]'
    default:             return 'bg-white/25 text-white'
  }
}

export function getCategoryIcon(cat: string): string {
  switch (cat.toLowerCase()) {
    case 'vorspeisen':   return 'soup_kitchen'
    case 'hauptspeisen': return 'lunch_dining'
    case 'desserts':     return 'icecream'
    case 'brunch':       return 'breakfast_dining'
    case 'snacks':       return 'cookie'
    case 'drinks':       return 'local_drink'
    default:             return 'restaurant_menu'
  }
}
