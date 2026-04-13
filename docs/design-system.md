# Miximixi – Design System "The Modern Heirloom"

Quelle: Google Stitch (`stitch_miximixi/`)

---

## Philosophie

- **"Digital Kitchen Journal"**: Warm, taktil, redaktionell – kein klinisches UI
- **Keine 1px-Borders**: Trennung ausschließlich durch Farbwechsel (Background Color Shifts)
- **Intentional Asymmetry**: Layouts staggeren, Elemente überlappen Bildränder
- **Glassmorphism**: Floating-Elemente als Frosted Glass (backdrop-blur-md, semi-transparent)

---

## Light Mode – "Heirloom Hearth"

### Farb-Tokens (Tailwind-Namen)

```js
colors: {
  "primary":                    "#a43f14",   // Terracotta
  "primary-dim":                "#943308",
  "primary-container":          "#ffad90",
  "on-primary":                 "#fff7f5",
  "on-primary-container":       "#702200",
  "secondary":                  "#526448",   // Sage Green
  "secondary-container":        "#e2f7d3",
  "on-secondary-container":     "#4d5f43",
  "surface":                    "#fff8f4",   // Warm Parchment
  "surface-bright":             "#fff8f4",
  "surface-dim":                "#e7d7cb",
  "surface-container-lowest":   "#ffffff",
  "surface-container-low":      "#fdf1e9",
  "surface-container":          "#f8ece2",
  "surface-container-high":     "#f3e6db",
  "surface-container-highest":  "#eee0d5",
  "surface-variant":            "#eee0d5",
  "surface-tint":               "#a43f14",
  "on-surface":                 "#393129",   // Kein reines Schwarz!
  "on-surface-variant":         "#675d54",
  "outline":                    "#84796f",
  "outline-variant":            "#bdb0a5",
  "background":                 "#fff8f4",
  "on-background":              "#393129",
  "inverse-surface":            "#110d0a",
  "inverse-primary":            "#f97d4f",
  "tertiary":                   "#655f4a",
  "tertiary-container":         "#f7eed2",
  "error":                      "#ac3434",
  "error-container":            "#f56965",
}
```

### Border Radius

```js
borderRadius: {
  DEFAULT: "1rem",   // 16px – Minimum
  lg:      "2rem",   // 32px – Cards, Images
  xl:      "3rem",   // 48px – Buttons (Pill), Hero
  full:    "9999px",
}
```

### Fonts

| Rolle | Font | Verwendung |
|-------|------|-----------|
| `font-headline` | Noto Serif | Display, Headlines – die "Stimme des Kochs" |
| `font-body` | Plus Jakarta Sans | Body, Labels, Navigation |
| `font-label` | Plus Jakarta Sans | Tags, Badges, Meta-Info |

Letter-Spacing für Headlines: `-0.02em` (premium, cohesive)

---

## Dark Mode – "Midnight Kitchen"

### Farb-Tokens

```js
// Aktiv wenn <html class="dark">
colors: {
  "primary":                    "#ffb59c",   // Luminous Orange (Ember)
  "primary-container":          "#e66d41",
  "on-primary":                 "#5c1900",
  "secondary":                  "#cfc5b6",   // Warm Stone
  "surface":                    "#161311",   // Deep Charcoal
  "surface-container-lowest":   "#100e0c",
  "surface-container-low":      "#1e1b19",
  "surface-container":          "#221f1d",
  "surface-container-high":     "#2d2927",
  "surface-container-highest":  "#383432",
  "surface-bright":             "#3c3836",
  "on-surface":                 "#e9e1dd",   // Kein reines Weiß!
  "on-surface-variant":         "#dec0b7",
  "outline-variant":            "#57423b",
  "background":                 "#161311",
}
```

### Fonts (Dark Mode)

| Rolle | Font |
|-------|------|
| `font-headline` | Noto Serif |
| `font-body` | Work Sans |
| `font-label` | Work Sans |

---

## Regeln

### DO ✅
- Weiß-Raum großzügig nutzen – lieber mehr Padding als eine Border
- `secondary` (Sage Green) für "vegetarisch"/"gesund"-Tags
- `primary-container` für Chef's Notes / Pro-Tip Callout-Boxen
- `xl` (3rem) Radius für Buttons → Pill-Form
- `lg` (2rem) Radius für Recipe-Bilder
- Gradient CTAs: `primary` → `primary-dim`
- Floating-Elemente: `surface-variant` + `backdrop-blur-md` (20px)
- Ambient Shadows: `blur: 32px`, `offset: 0`, `opacity: 6%`, Farbe `on-surface`

### DON'T ❌
- Kein `#000000` – immer `on-surface` (`#393129`) für Text
- Keine 1px Solid Borders zur Trennung
- Keine Standard Material Shadows (zu "software-centric")
- Kein Radius unter `sm` (0.5rem) – Minimum immer `DEFAULT` (1rem)
- Keine `divider`-Linien zwischen Steps – nur 1.5rem Spacing

---

## Komponenten-Spezifikationen

### Recipe Card
- Bild: `rounded-[2rem]` (lg), Hover: `scale-105` (700ms transition)
- Title überlappt Bild-Unterkante um 16px (Glassmorphism-Overlay)
- Source-Badge: `bg-white/90 backdrop-blur-md`, oben rechts

### Buttons
- Primary: `bg-primary`, `text-on-primary`, `rounded-xl` (pill), Gradient optional
- Inactive Filter-Chip: `bg-white border border-outline-variant/30`
- Active Filter-Chip: `bg-primary text-on-primary`

### Input Fields
- Fill: `surface-container-low`, kein Bottom-Line-Only-Style
- Radius: `sm` (0.5rem) minimum

### Cook Mode Timer
- Glassmorphism Panel: `bg-surface-container rounded-xl border border-outline-variant/15`
- Timer-Zahl: `font-headline text-6xl text-primary`

### Chef's Tip Toast
- `glass-panel` = `bg-[rgba(60,56,54,0.6)] backdrop-blur-[24px]`
- `border-l-4 border-primary`
- Floating, zentriert am Bottom

---

## Google Fonts Import

```html
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif:ital,wght@0,400;0,700;1,400;1,700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Work+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
```

Material Symbols Base Style:
```css
.material-symbols-outlined {
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}
```
