# Design System: Midnight Kitchen Expansion

## 1. Overview & Creative North Star
**The Creative North Star: "The Culinary Alchemist"**
This dark mode expansion is not merely an inversion of light mode; it is a sensory shift. We are moving from the bright morning kitchen into the "Midnight Kitchen"—a space of focused intimacy, warm stone surfaces, and the soft glow of a low-hanging pendant light. 

To achieve a "High-End Editorial" feel, this design system rejects the standard, boxy constraints of traditional SaaS platforms. Instead, it embraces **Atmospheric Depth**. We break the "template" look by using intentional asymmetry, overlapping elements (e.g., an image bleeding off the edge of a container), and a typographic scale that favors dramatic contrast between sweeping Noto Serif headlines and utilitarian Work Sans labels.

---

## 2. Colors: Tonal Depth & The Glow
The palette is rooted in deep, earthy stones and charcoals, punctuated by a "glowing" ember orange.

### Color Roles
- **Primary (`#ffb59c`)**: A vibrant, luminous version of our signature orange. It should feel like heat or a spark in the dark. Use for primary CTAs and critical focus points.
- **Surface & Background (`#161311`)**: The foundation. A deep, warm charcoal that provides more soul than a pure neutral black.
- **Secondary (`#cfc5b6`)**: Muted, warm stone. Used for secondary actions and supporting elements to keep the palette sophisticated.

### The "No-Line" Rule
**Explicit Instruction:** Do not use 1px solid borders to define sections. 
Boundaries must be defined through background color shifts. For example, a recipe card (`surface_container_low`) should sit on the main `background` without a stroke. The change in tonal value is the boundary.

### The "Glass & Gradient" Rule
To move beyond a flat UI, main CTAs and Hero sections should utilize a subtle linear gradient from `primary` (#ffb59c) to `primary_container` (#e66d41). This creates a "smoldering" effect rather than a flat plastic look. 

---

## 3. Typography: Editorial Authority
Our typography is a conversation between heritage and modern utility.

- **Display & Headlines (Noto Serif)**: These are our "hero" moments. Use `display-lg` for editorial headers. The serif adds a sense of history and "Heirloom" quality. Ensure tight tracking on larger sizes to maintain a premium feel.
- **Title, Body, & Labels (Work Sans)**: The "Hearth"—reliable, clean, and highly legible. 
- **The Hierarchy Strategy**: To achieve an editorial look, use extreme scale. Pair a `display-lg` title with a `label-md` uppercase kicker above it. This high-contrast pairing signals intentional design rather than a default template.

---

## 4. Elevation & Depth: Tonal Layering
In the Midnight Kitchen, shadows are rarely black; they are simply a lack of light.

### The Layering Principle
Depth is achieved by stacking the `surface-container` tiers. 
- **Level 0**: `surface` (#161311) - Main page background.
- **Level 1**: `surface_container_low` (#1E1B19) - Large layout sections.
- **Level 2**: `surface_container` (#221F1D) - Cards or inset content.
- **Level 3**: `surface_container_high` (#2D2927) - Floating menus or active states.

### Glassmorphism & "Ghost Borders"
For floating elements (like a navigation bar or a hovering modal), use `surface_bright` at 60% opacity with a `24px` backdrop-blur. 
*   **The Ghost Border:** If a container requires more definition, use the `outline_variant` token at **15% opacity**. This creates a "shimmer" on the edge that suggests a border without the heaviness of a solid line.

### Ambient Shadows
Avoid "Drop Shadows." Use "Ambient Glows." Shadows should be large, diffused (`blur: 40px`), and use a low-opacity tint of the `primary` or `on_surface` color (e.g., 4% opacity) to mimic the way light wraps around objects in a dimly lit room.

---

## 5. Components

### Buttons
- **Primary**: A gradient fill from `primary` to `primary_container`. Text is `on_primary` (#5C1900). Roundedness: `md` (0.375rem).
- **Secondary**: `secondary_container` fill with `on_secondary_container` text. No border.
- **Tertiary**: Ghost style. Text in `primary`. Underline on hover only.

### Cards & Lists
- **Rule**: No divider lines. Separate list items using 16px of vertical white space or a subtle hover state shift to `surface_container_highest`.
- **Imagery**: Photos within cards should have a slight "inner glow" (a 1px inner stroke of `outline_variant` at 10%) to prevent them from feeling "cut out" of the dark background.

### Input Fields
- **Default State**: Fill with `surface_container_highest`. No border.
- **Focus State**: A subtle 1px "Ghost Border" using `primary` at 40% and a soft `primary` outer glow.

### Signature Component: The "Recipe Toast"
A specialized notification component using `surface_bright` with heavy backdrop-blur and a `primary` left-accent bar (4px width). This should feel like a premium glass element floating over the "Midnight Kitchen."

---

## 6. Do's and Don'ts

### Do:
- **Use Asymmetry**: Place text off-center or allow images to overlap container boundaries to create a "crafted" editorial feel.
- **Embrace Negative Space**: Let the `background` color breathe. High-end design is defined by what you leave out.
- **Check Contrast**: Ensure `on_surface_variant` text on `surface` backgrounds meets WCAG AA standards for legibility.

### Don't:
- **No Pure White**: Never use `#FFFFFF`. Use `on_surface` (#E9E1DD) for text to prevent eye strain.
- **No Solid Outlines**: Avoid the "Bootstrap" look. If you feel you need a border, try a background color shift first.
- **No Sharp Corners**: Stick to the Roundedness Scale (Default: 0.25rem). Hard 0px corners feel too industrial; fully round feels too "app-y." The `md` and `lg` settings provide the "premium handcrafted" sweet spot.