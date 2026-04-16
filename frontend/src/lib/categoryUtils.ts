export function categoryChipCls(cat: string): string {
  switch (cat.toLowerCase()) {
    case 'vorspeisen':   return 'bg-amber-200/90 text-amber-900 dark:bg-amber-900/80 dark:text-amber-200'
    case 'hauptspeisen': return 'bg-orange-200/90 text-orange-900 dark:bg-orange-900/80 dark:text-orange-200'
    case 'desserts':     return 'bg-green-200/90 text-green-900 dark:bg-green-900/80 dark:text-green-200'
    case 'brunch':       return 'bg-rose-200/90 text-rose-900 dark:bg-rose-900/80 dark:text-rose-200'
    case 'snacks':       return 'bg-yellow-200/90 text-yellow-900 dark:bg-yellow-900/80 dark:text-yellow-200'
    case 'drinks':       return 'bg-sky-200/90 text-sky-900 dark:bg-sky-900/80 dark:text-sky-200'
    default:             return 'bg-white/25 text-white dark:bg-black/40 dark:text-white'
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
