# Design Spec: Three Frontend Improvements for Miximixi

**Date:** 2026-04-17  
**Author:** Claude Code  
**Status:** Ready for Implementation

---

## Overview

Three UX improvements for the Miximixi frontend to enhance visual consistency, navigation intuitiveness, and visual feedback during interactions.

---

## 1. Color Mode Consistency for Category Colors

### Problem
Category badge colors in recipe cards use hardcoded Tailwind classes (`bg-amber-200/90`, etc.) that only work in light mode. While CSS variables for dark mode are defined in `index.css`, the `RecipeCard` component bypasses them by using hardcoded class names.

### Solution
Refactor category color handling to use CSS custom properties:

1. **Update `RecipeCard.tsx`:**
   - Replace `getCategoryBgColor()` function (currently returns Tailwind classes)
   - New function returns CSS variable names: `'var(--cat-vorspeisen-bg)'`
   - Update the article element to use `style={{ backgroundColor: ... }}` with the CSS variable
   - Update text color similarly using inline styles

2. **No changes to `index.css`:**
   - Category color variables already exist with light/dark mode definitions
   - System preference detection already works via `@media (prefers-color-scheme: dark)`

### Outcome
- Category colors automatically adapt to light/dark/system theme
- Single source of truth (CSS variables in `index.css`)
- Consistent behavior across all theme modes

### Files Changed
- `frontend/src/components/RecipeCard.tsx`

---

## 2. Image Modal Back Button/Swipe Handling

### Problem
When viewing a fullscreen image in the recipe detail page:
- Clicking browser back button navigates away from the recipe (back to feed)
- Expected: Close the image modal, stay on recipe page
- Same for step images in the instruction section

### Solution
Use History API to create intermediate navigation state:

1. **When fullscreen modal opens:**
   - Call `history.pushState({ imageModal: true }, '', window.location.href)`
   - Creates a history entry without changing the URL

2. **Existing `popstate` handler:**
   - Already in place at [RecipeDetailPage.tsx:293-303](file:///c:/Users/fabia/git/miximixi/frontend/src/pages/RecipeDetailPage.tsx#L293-L303)
   - Currently only closes the modal
   - Works perfectly with the new history state

3. **Apply same pattern to step images:**
   - Use same `popstate` handler for step image fullscreen state

### Result
- First back press: Close image modal → stay on recipe detail page
- Second back press: Navigate back to recipe feed
- Mobile swipe-back gesture works naturally
- Behavior matches native app expectations

### Files Changed
- `frontend/src/pages/RecipeDetailPage.tsx` (update modal open handlers)

---

## 3. Card Animations (Fade + Subtle Scale)

### Problem
Recipe cards appear and disappear instantly when:
- Changing category filters
- Toggling tags
- Loading more recipes on infinite scroll
- Shows no visual feedback for dynamic content changes

### Solution
Implement fade + scale animation matching existing page transition timing:

1. **Add animation keyframes to `index.css`:**
   ```css
   @keyframes mx-card-enter {
     from { opacity: 0; scale: 0.95; }
     to { opacity: 1; scale: 1; }
   }
   
   @keyframes mx-card-exit {
     from { opacity: 1; scale: 1; }
     to { opacity: 0; scale: 0.95; }
   }
   ```

2. **Timing (from existing page transitions):**
   - Enter duration: 300ms (matches `vt-fwd-new`)
   - Exit duration: 200ms (matches `vt-fwd-old`)
   - Timing function: `ease-out` for enter, `ease-in` for exit
   - Matches existing `vt-fwd-*` animations

3. **Implementation in `FeedPage.tsx`:**
   - Track which cards are "new" (appeared after initial render)
   - Apply `.mx-card-enter` animation to new cards in the grid
   - Apply `.mx-card-exit` animation to removed cards
   - Use React key changes or ref-tracking to detect new/removed cards

4. **User-visible behavior:**
   - Cards being removed (via filter change) fade out smoothly
   - Cards being added (via filter change, tag select, infinite scroll) fade in smoothly
   - Visual continuity with page navigation animations

### Files Changed
- `frontend/src/index.css` (add keyframes)
- `frontend/src/pages/FeedPage.tsx` (track new/removed cards, apply animation classes)

---

## Implementation Order

1. **Color Mode Consistency** (simplest, no state changes needed)
2. **Image Modal Navigation** (straightforward History API usage)
3. **Card Animations** (most complex, requires tracking card lifecycle)

---

## Testing Checklist

- [ ] **Color Mode:** Switch between light/dark/system and verify category colors are correct
- [ ] **Image Modal:** Click image → back button closes modal (stay on page) → back button again goes to feed
- [ ] **Image Modal Mobile:** Open image → swipe back closes modal → swipe back again navigates away
- [ ] **Step Images:** Same behavior as hero image
- [ ] **Card Animations:** Filter by category, see cards fade in/out smoothly
- [ ] **Card Animations:** Toggle tag filters, see cards fade in/out
- [ ] **Card Animations:** Infinite scroll loads more, new cards fade in
- [ ] **Animation Timing:** Matches existing page transition feel

---

## Future Tweaks

- Animation timing can be adjusted if needed (currently matches page transitions)
- Card scale amount can be tweaked (currently 0.95 = 5% smaller at start)
- Exit animation can be disabled if preference changes
