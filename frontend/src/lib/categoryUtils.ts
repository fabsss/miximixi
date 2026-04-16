export function categoryChipCls(cat: string): string {
  switch (cat.toLowerCase()) {
    case 'vorspeisen':   return 'bg-amber-200/90 text-amber-900'
    case 'hauptspeisen': return 'bg-orange-200/90 text-orange-900'
    case 'desserts':     return 'bg-green-200/90 text-green-900'
    case 'brunch':       return 'bg-rose-200/90 text-rose-900'
    case 'snacks':       return 'bg-purple-200/90 text-purple-900'
    case 'drinks':       return 'bg-sky-200/90 text-sky-900'
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
