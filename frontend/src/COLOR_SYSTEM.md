# Color System – Single Source of Truth

## Overview
All colors in the Miximixi app are centrally defined as **CSS variables in `src/index.css`**. This ensures perfect consistency across light and dark modes, and makes theme updates simple.

## How It Works

1. **CSS Variables** (`src/index.css`): Define all colors once per theme
2. **Automatic Theming**: CSS variables change when `data-theme` attribute changes
3. **Components**: Use CSS variables via `categoryChipCls()` function

```
index.css (colors)  →  categoryChipCls()  →  Components
                       (function)
                       single entry point
```

## Theme Colors (`--mx-*`)
Define the base theme palette for light and dark modes:

```css
/* Light mode */
--mx-primary: #a43f14
--mx-primary-container: #ffad90
--mx-surface: #fff8f4
--mx-surface-low: #fdf1e9
/* ... and more */

/* Dark mode */
--mx-primary: #ffb59c
--mx-primary-dim: #e66d41
/* ... and more */
```

**Used for:** Primary actions, text, surfaces, and general theme.

## Category Colors (`--cat-*`)
Each recipe category has **one set of colors** that automatically adapt to the theme:

| Category | CSS Variables | Light Mode (Pastel) | Dark Mode (Muted) |
|----------|---|---|---|
| Vorspeisen | `--cat-vorspeisen-bg/text` | Bright yellow | Muted tan |
| Hauptspeisen | `--cat-hauptspeisen-bg/text` | Bright orange | Muted brown |
| Desserts | `--cat-desserts-bg/text` | Bright green | Muted green |
| Brunch | `--cat-brunch-bg/text` | Bright pink | Muted mauve |
| Snacks | `--cat-snacks-bg/text` | Bright purple | Muted purple |
| Drinks | `--cat-drinks-bg/text` | Bright blue | Muted slate |

**Used for:** Category chips, cards, sidebar buttons, and category labels.

### Example: Vorspeisen
```css
/* Light mode – pastel */
--cat-vorspeisen-bg: #fbbf24   (bright amber)
--cat-vorspeisen-text: #78350f (dark brown text)

/* Dark mode – muted */
--cat-vorspeisen-bg: #7d6449   (muted tan)
--cat-vorspeisen-text: #fef3c7 (light amber text)
```

Both use the **same CSS variable names**, so `categoryChipCls('Vorspeisen')` works in both themes!

## Sidebar Background (`--cat-sidebar-bg`)
- **Light mode:** `transparent` — sidebar blends seamlessly with page
- **Dark mode:** `var(--mx-surface-low)` — subtle elevated surface

## How to Use Colors

### ✅ CORRECT – Use the single source of truth

**In components (TypeScript/TSX):**
```tsx
import { categoryChipCls } from '../lib/categoryUtils'

// This function returns CSS variables automatically
const className = categoryChipCls('Vorspeisen')
// Returns: "bg-[var(--cat-vorspeisen-bg)] text-[var(--cat-vorspeisen-text)]"
// Automatically pastel in light mode, muted in dark mode!
```

**In Tailwind classes:**
```tsx
className="bg-[var(--cat-vorspeisen-bg)] text-[var(--cat-vorspeisen-text)]"
```

**In CSS:**
```css
.my-category-element {
  background-color: var(--cat-vorspeisen-bg);
  color: var(--cat-vorspeisen-text);
}
```

### ❌ WRONG – Avoid hardcoding colors
```tsx
// DON'T do this:
className="bg-amber-200 text-amber-900"  // only light mode!
className="bg-[#fbbf24] text-[#78350f]"  // only light mode!
```

## Adding New Category Colors

1. Add CSS variables to light and dark modes in `src/index.css`:
   ```css
   [data-theme="light"] {
     --cat-mynewcat-bg: #your-pastel-bg;
     --cat-mynewcat-text: #your-pastel-text;
   }
   
   [data-theme="dark"] {
     --cat-mynewcat-bg: #your-muted-bg;
     --cat-mynewcat-text: #your-muted-text;
   }
   ```

2. Add a case in `categoryChipCls()` in `src/lib/categoryUtils.ts`:
   ```ts
   case 'mynewcat': return 'bg-[var(--cat-mynewcat-bg)] text-[var(--cat-mynewcat-text)]'
   ```

3. Update this documentation

## Theme Detection

The app uses `data-theme` attribute on the `<html>` element:
- `[data-theme="light"]` — light mode active (pastel colors)
- `[data-theme="dark"]` — dark mode active (muted colors)
- No attribute — system preference applies (via `@media (prefers-color-scheme: dark)`)

CSS variables automatically switch when the theme changes. No component modifications needed!
