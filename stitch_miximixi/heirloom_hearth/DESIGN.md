# Design System Strategy: The Culinary Editorial

## 1. Overview & Creative North Star
**Creative North Star: "The Modern Heirloom"**

This design system rejects the clinical, high-contrast rigidity of traditional utility apps. Instead, we are building a "Digital Kitchen Journal"—an experience that feels as tactile and warm as a physical cookbook but operates with the precision of modern technology. 

To break the "template" look, we move away from standard grids toward **Intentional Asymmetry**. Recipes aren't just data points; they are stories. We achieve this by overlapping high-character serif typography across image boundaries and utilizing a "staggered" layout for ingredient lists and step-by-step instructions. We prioritize breathing room over information density, ensuring every recipe feels like a curated editorial piece rather than a spreadsheet.

---

## 2. Colors & Surface Philosophy
The palette is built to be "appetizing"—grounded in earth tones that evoke copper cookware, fresh herbs, and parchment paper.

*   **The "No-Line" Rule:** Under no circumstances are 1px solid borders to be used for sectioning content. Visual boundaries must be defined through **Background Color Shifts**. For example, a recipe card (using `surface_container_lowest`) should sit atop a section background of `surface_container_low`. The contrast is felt, not seen.
*   **Surface Hierarchy & Nesting:** Treat the UI as layers of fine linens.
    *   **Base:** `surface` (#fff8f4) for the main canvas.
    *   **Interactive Areas:** Use `surface_container` for secondary navigation areas.
    *   **Focus Elements:** Use `surface_container_highest` for high-importance modals or pop-overs.
*   **The "Glass & Gradient" Rule:** To provide a "soulful" touch, primary CTAs should utilize a subtle linear gradient from `primary` (#a43f14) to `primary_dim` (#943308). Floating action buttons or navigation bars should use a "Frosted Glass" effect: a semi-transparent `surface_variant` with a 20px backdrop-blur to let the warm terracotta and sage tones of the content bleed through.

---

## 3. Typography: The Editorial Mix
We use a high-contrast pairing to balance utility with personality.

*   **The Hero (Noto Serif):** Used for `display` and `headline` scales. This font brings the "characterful, slightly rounded" vibe. It is the voice of the cook. It should be typeset with tight letter spacing (-0.02em) to feel premium and cohesive.
*   **The Guide (Plus Jakarta Sans):** Used for `title`, `body`, and `label` scales. This is the "Modern Tech" side of the system—clean, approachable, and highly legible. Use `title-lg` for section headers and `body-md` for the bulk of instructions.
*   **Hierarchy Tip:** Pair a `display-md` (Noto Serif) title with a `label-md` (Plus Jakarta Sans) uppercase category tag in `primary` color for a sophisticated, magazine-style header.

---

## 4. Elevation & Depth
In this system, depth is organic, not artificial. We mimic the way light hits a thick stack of paper.

*   **Tonal Layering:** Avoid shadows for static elements. Instead, use the `surface-container` tiers. A search bar should be `surface_container_highest` sitting on a `surface` header.
*   **Ambient Shadows:** For floating elements (like a "Save Recipe" FAB), use a shadow with a 32px blur, 0px offset, and 6% opacity using the `on_surface` color. It should feel like a soft glow, not a dark drop-shadow.
*   **The "Ghost Border" Fallback:** If accessibility requires a stroke (e.g., in high-glare environments), use the `outline_variant` token at **15% opacity**. It should be a mere suggestion of a container.

---

## 5. Component Guidelines

### Buttons & Inputs
*   **Primary Button:** Uses `primary` background with `on_primary` text. Apply the `xl` (3rem) roundedness for a pill shape that feels friendly.
*   **Input Fields:** Use `surface_container_low` for the field background. Never use a bottom-line-only style; use a fully enclosed container with `sm` (0.5rem) roundedness to keep it grounded.

### Recipe Cards & Content
*   **No Dividers:** Forbid the use of `divider` lines. Separate recipe steps using `md` (1.5rem) vertical spacing. 
*   **Image Handling:** Always use `lg` (2rem) corner radius for recipe imagery. For a "signature" look, allow the `headline-sm` title to overlap the bottom-left corner of the image by 16px, backed by a subtle glassmorphism overlay.

### Chips & Tags
*   **Selection Chips:** Use `secondary_container` (Sage Green) for active states. This provides a cooling, "fresh" contrast to the warm Terracotta primary actions.

### Contextual Components
*   **Measurement Converter:** A floating "Glass" card using `surface_tint` at 5% opacity to allow users to toggle between Metric and Imperial without leaving the flow.
*   **The "Kitchen Mode" Toggle:** A large, tactile switch that transitions the app into a high-contrast, large-type (`display-sm`) view for hands-free reading while cooking.

---

## 6. Do’s and Don’ts

### Do:
*   **Do** embrace white space. If a layout feels crowded, increase the spacing rather than adding a border.
*   **Do** use `secondary` (Sage) for "healthy" or "vegetarian" tags to create a psychological link to freshness.
*   **Do** use `primary_container` for "Pro-tips" or "Chef's Notes" callout boxes.

### Don’t:
*   **Don’t** use pure black (#000000). Use `on_surface` (#393129) for all text to maintain the warm, organic feel.
*   **Don’t** use sharp corners. The minimum radius is `sm` (0.5rem); anything sharper breaks the "Home Cooking" personality.
*   **Don’t** use standard Material shadows. They are too "software-centric." Stick to Tonal Layering or Ambient Shadows.