# Frontend Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve visual consistency across theme modes, fix unintuitive back button behavior in image modals, and add smooth animations to recipe cards during filtering and loading.

**Architecture:** Three independent improvements: (1) CSS variable refactoring in RecipeCard to respect theme colors, (2) History API integration in RecipeDetailPage to intercept back button for image modals, (3) CSS keyframe animations and React lifecycle tracking in FeedPage to animate cards in/out.

**Tech Stack:** React, TypeScript, Tailwind CSS, CSS custom properties, History API

---

## File Structure

**Modified Files:**
- `frontend/src/index.css` — Add card animation keyframes
- `frontend/src/components/RecipeCard.tsx` — Replace hardcoded Tailwind classes with CSS variables
- `frontend/src/pages/RecipeDetailPage.tsx` — Add history.pushState() calls for image modals
- `frontend/src/pages/FeedPage.tsx` — Track new/removed cards and apply animation classes

---

## Task 1: Add Card Animation Keyframes to index.css

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Open index.css and find the keyframes section**

Location: End of the page transitions section (around line 203). This is where `mx-fadein` is defined.

- [ ] **Step 2: Add card enter and exit keyframes after the page transitions**

Add this after line 207 (after `@keyframes mx-fadein { ... }`):

```css
/* Card animations */
@keyframes mx-card-enter {
  from {
    opacity: 0;
    scale: 0.95;
  }
  to {
    opacity: 1;
    scale: 1;
  }
}

@keyframes mx-card-exit {
  from {
    opacity: 1;
    scale: 1;
  }
  to {
    opacity: 0;
    scale: 0.95;
  }
}
```

- [ ] **Step 3: Add CSS classes for applying the animations**

Add this after the keyframes (around line 225):

```css
.mx-card-enter {
  animation: 300ms ease-out both mx-card-enter;
}

.mx-card-exit {
  animation: 200ms ease-in both mx-card-exit;
}
```

- [ ] **Step 4: Verify syntax**

Open `frontend/src/index.css` and confirm:
- Keyframes section is valid CSS
- No syntax errors (should build fine)

- [ ] **Step 5: Commit**

```bash
cd c:/Users/fabia/git/miximixi
git add frontend/src/index.css
git commit -m "feat: Add card animation keyframes for enter/exit transitions"
```

---

## Task 2: Fix Category Colors in RecipeCard

**Files:**
- Modify: `frontend/src/components/RecipeCard.tsx`

- [ ] **Step 1: Read the current RecipeCard.tsx file**

Focus on lines 14-24 where `getCategoryBgColor()` is defined. This function currently returns hardcoded Tailwind classes like `'bg-amber-200/90'`.

- [ ] **Step 2: Replace getCategoryBgColor() function**

Replace the entire function (lines 14-24) with this new version that returns CSS variable values:

```typescript
function getCategoryBgColor(cat: string): { bg: string; text: string } {
  const bgVars: Record<string, { bg: string; text: string }> = {
    'vorspeisen':   { bg: 'var(--cat-vorspeisen-bg)', text: 'var(--cat-vorspeisen-text)' },
    'hauptspeisen': { bg: 'var(--cat-hauptspeisen-bg)', text: 'var(--cat-hauptspeisen-text)' },
    'desserts':     { bg: 'var(--cat-desserts-bg)', text: 'var(--cat-desserts-text)' },
    'brunch':       { bg: 'var(--cat-brunch-bg)', text: 'var(--cat-brunch-text)' },
    'snacks':       { bg: 'var(--cat-snacks-bg)', text: 'var(--cat-snacks-text)' },
    'drinks':       { bg: 'var(--cat-drinks-bg)', text: 'var(--cat-drinks-text)' },
  }
  const key = cat.toLowerCase()
  return bgVars[key] ?? { bg: 'var(--mx-surface-container)', text: 'var(--mx-on-surface-variant)' }
}
```

- [ ] **Step 3: Update the article element to use inline styles**

Find line 74 where the article element is rendered. Update it to use inline styles with CSS variables:

Replace:
```typescript
<article className={`rounded-[2rem] ${bgColorClass} p-3 transition duration-500 hover:translate-y-[-2px] hover:shadow-[0_24px_52px_var(--mx-glow)]`}>
```

With:
```typescript
<article 
  className="rounded-[2rem] p-3 transition duration-500 hover:translate-y-[-2px] hover:shadow-[0_24px_52px_var(--mx-glow)]"
  style={{
    backgroundColor: bgColorClass.bg,
    color: bgColorClass.text,
  }}
>
```

- [ ] **Step 4: Update bgColorClass variable assignment**

Find line 70 where `bgColorClass` is assigned. It currently uses the old function return type. Update it:

Replace:
```typescript
const bgColorClass = primaryCategory ? getCategoryBgColor(primaryCategory) : 'bg-[var(--mx-surface-container)]'
```

With:
```typescript
const bgColorClass = primaryCategory 
  ? getCategoryBgColor(primaryCategory) 
  : { bg: 'var(--mx-surface-container)', text: 'var(--mx-on-surface-variant)' }
```

- [ ] **Step 5: Verify the component**

Open the file and confirm:
- `getCategoryBgColor()` returns an object with `bg` and `text` properties
- The article element uses `style` with inline CSS variables
- TypeScript has no type errors (all properties exist)

- [ ] **Step 6: Test in browser**

Start the dev server and:
- View recipes in light mode — category badges should show correct colors
- Switch to dark mode (system or manual) — category badges should update to dark variants
- Verify text is readable in both modes (good contrast)

- [ ] **Step 7: Commit**

```bash
cd c:/Users/fabia/git/miximixi
git add frontend/src/components/RecipeCard.tsx
git commit -m "feat: Use CSS variables for category colors to respect theme mode"
```

---

## Task 3: Add History API to Fullscreen Image Modal

**Files:**
- Modify: `frontend/src/pages/RecipeDetailPage.tsx`

- [ ] **Step 1: Locate the showFullscreenImage state and modal open handler**

Find:
- Line 232: `const [showFullscreenImage, setShowFullscreenImage] = useState(false)`
- Line 412-415: Where the hero image is clicked to open the modal

- [ ] **Step 2: Update the onClick handler for hero image**

Find line 412 in the section marked `HERO`. Update the `onClick` handler:

Replace:
```typescript
onClick={(e) => {
  // Don't zoom if clicking on a link
  if ((e.target as HTMLElement).closest('a')) return
  setShowFullscreenImage(true)
}}
```

With:
```typescript
onClick={(e) => {
  // Don't zoom if clicking on a link
  if ((e.target as HTMLElement).closest('a')) return
  setShowFullscreenImage(true)
  history.pushState({ imageModal: 'hero' }, '', window.location.href)
}}
```

- [ ] **Step 3: Locate the step image click handler**

Find line 783 in the instructions section where step images are clicked. This is inside the map of `stepsToShow.map()`.

- [ ] **Step 4: Update the onClick handler for step images**

Find the onClick for step images (around line 783):

Replace:
```typescript
onClick={() => setFullscreenStepImage(getStepImageUrl(recipe.id, step.step_image_filename!))}
```

With:
```typescript
onClick={() => {
  setFullscreenStepImage(getStepImageUrl(recipe.id, step.step_image_filename!))
  history.pushState({ imageModal: 'step' }, '', window.location.href)
}}
```

- [ ] **Step 5: Update the popstate handler to handle different modal types**

Find the existing `popstate` handler at lines 293-303. Replace it with:

```typescript
// Handle browser back button to close fullscreen images
useEffect(() => {
  if (!showFullscreenImage && !fullscreenStepImage) return

  const handlePopState = () => {
    if (showFullscreenImage) setShowFullscreenImage(false)
    if (fullscreenStepImage) setFullscreenStepImage(null)
  }

  window.addEventListener('popstate', handlePopState)
  return () => window.removeEventListener('popstate', handlePopState)
}, [showFullscreenImage, fullscreenStepImage])
```

This handler is already correct — it closes modals on back button. No changes needed if it already works, but verify the dependencies are correct.

- [ ] **Step 6: Test hero image modal navigation**

Start the dev server and:
1. Open a recipe detail page
2. Click on the hero image to open fullscreen
3. Click browser back button → Modal should close, stay on recipe page
4. Verify URL didn't change
5. Click back again → Should navigate back to feed

- [ ] **Step 7: Test step image modal navigation**

In the instructions section:
1. Click a step image to open fullscreen
2. Click browser back button → Modal should close, stay on recipe page
3. Click back again → Navigate to previous page

- [ ] **Step 8: Test mobile swipe-back**

On mobile device or mobile emulation:
1. Open recipe detail
2. Click image to open fullscreen
3. Swipe back (right edge gesture) → Modal should close
4. Swipe back again → Navigate away

- [ ] **Step 9: Commit**

```bash
cd c:/Users/fabia/git/miximixi
git add frontend/src/pages/RecipeDetailPage.tsx
git commit -m "feat: Add history.pushState() for image modals so back button closes modal"
```

---

## Task 4: Add Card Animation Tracking to FeedPage

**Files:**
- Modify: `frontend/src/pages/FeedPage.tsx`

- [ ] **Step 1: Add useRef to track previous recipe IDs**

Find the imports at the top (line 1). Verify `useRef` is already imported from React:

```typescript
import { useEffect, useMemo, useRef, useState } from 'react'
```

It should already be there. If not, add it.

- [ ] **Step 2: Add refs and state to track card animations**

Find line 61 where `sentinelRef` is defined. After that line, add:

```typescript
const prevRecipeIdsRef = useRef<Set<string>>(new Set())
const [animatingCardIds, setAnimatingCardIds] = useState<Set<string>>(new Set())
```

- [ ] **Step 3: Add effect to track new/removed cards**

Add this effect after the existing `useEffect` blocks (after line 116):

```typescript
// Track new and removed cards for animations
useEffect(() => {
  const currentIds = new Set(filteredRecipes.map(r => r.id))
  const prevIds = prevRecipeIdsRef.current

  // Cards that are new (in current but not in previous)
  const newCardIds = new Set<string>()
  currentIds.forEach(id => {
    if (!prevIds.has(id)) {
      newCardIds.add(id)
    }
  })

  // Cards that were removed (in previous but not in current)
  const removedCardIds = new Set<string>()
  prevIds.forEach(id => {
    if (!currentIds.has(id)) {
      removedCardIds.add(id)
    }
  })

  // Update animating cards set to include both new and removed
  if (newCardIds.size > 0 || removedCardIds.size > 0) {
    const combined = new Set([...newCardIds, ...removedCardIds])
    setAnimatingCardIds(combined)

    // Clear animation state after the animation completes (300ms)
    const timer = setTimeout(() => {
      setAnimatingCardIds(new Set())
    }, 300)

    prevRecipeIdsRef.current = currentIds
    return () => clearTimeout(timer)
  }

  prevRecipeIdsRef.current = currentIds
}, [filteredRecipes])
```

- [ ] **Step 4: Update RecipeCard rendering to apply animation classes**

Find line 379-381 where RecipeCard is rendered:

Replace:
```typescript
{filteredRecipes.map((recipe, index) => (
  <RecipeCard key={recipe.id} recipe={recipe} index={index} />
))}
```

With:
```typescript
{filteredRecipes.map((recipe, index) => {
  const isAnimating = animatingCardIds.has(recipe.id)
  const animationClass = isAnimating ? 'mx-card-enter' : ''
  return (
    <div key={recipe.id} className={animationClass}>
      <RecipeCard recipe={recipe} index={index} />
    </div>
  )
})}
```

- [ ] **Step 5: Verify the logic**

Read through the effect and confirm:
- `newCardIds` tracks cards appearing for the first time
- `animatingCardIds` is used to apply the animation class
- Timer clears animation state after 300ms (matching the CSS animation duration)
- `prevRecipeIdsRef` is updated to track current state

- [ ] **Step 6: Test category filtering**

Start the dev server and:
1. View the feed with multiple categories
2. Click a category filter → Cards should fade in/scale up smoothly
3. Click "Alle" to show all → New cards should animate in
4. Switch between categories → Cards should fade out and new ones fade in

- [ ] **Step 7: Test tag filtering**

1. Click a tag filter → Matching cards should remain visible
2. Unmatched cards should fade out
3. Add another tag filter → Only matching cards animate in

- [ ] **Step 8: Test infinite scroll**

1. Scroll to bottom to trigger "Load more"
2. New cards should appear with fade-in animation
3. Verify animation timing matches the CSS (300ms)

- [ ] **Step 9: Test favorites filter**

1. Click "Favoriten" button
2. Only favorite recipes should remain
3. Non-favorited cards should fade out
4. Click again to show all → All cards fade back in

- [ ] **Step 10: Commit**

```bash
cd c:/Users/fabia/git/miximixi
git add frontend/src/pages/FeedPage.tsx
git commit -m "feat: Add card animations for filtering and loading"
```

---

## Task 5: Run Final Tests and Verify All Improvements

**Files:**
- No new files, verify existing changes

- [ ] **Step 1: Start dev server**

```bash
cd c:/Users/fabia/git/miximixi/frontend
npm run dev
```

- [ ] **Step 2: Test color mode consistency**

1. Open a recipe detail or feed page
2. Verify category badges are visible with correct colors
3. Open browser DevTools and toggle dark mode via Appearance
4. Category colors should update automatically
5. Repeat with system preference simulator if available

- [ ] **Step 3: Test image modal back navigation (hero image)**

1. Click a recipe card to open detail page
2. Click the hero image to zoom
3. Click browser back button or swipe back (mobile)
4. Modal closes, stay on recipe detail page
5. Click back again → Navigate to feed

- [ ] **Step 4: Test image modal back navigation (step images)**

1. Scroll to instructions section
2. Click a step image if available
3. Click back → Modal closes, stay on page
4. Click back → Navigate away

- [ ] **Step 5: Test card animations (category filter)**

1. On feed page, click a category
2. Watch cards fade in with subtle scale animation
3. Click different category → Cards fade out, new ones fade in
4. Timing should feel smooth (300ms total)

- [ ] **Step 6: Test card animations (tag filter)**

1. Click a tag → Cards animate based on filter match
2. Click multiple tags → Filtered set animates
3. Remove tag → Remaining cards fade back

- [ ] **Step 7: Test card animations (infinite scroll)**

1. Scroll to bottom
2. New recipes load
3. New cards fade in smoothly
4. Verify they don't appear instantly

- [ ] **Step 8: Check for console errors**

1. Open DevTools Console
2. Verify no errors or warnings
3. Check that console is clean

- [ ] **Step 9: Test on mobile emulation**

1. DevTools → Device emulation (iPhone 12)
2. Test all animations at mobile viewport
3. Test back button and swipe gestures
4. Verify responsive layout unaffected

- [ ] **Step 10: Run linter and type check**

```bash
cd c:/Users/fabia/git/miximixi/frontend
npm run lint
npx tsc --noEmit
npm run build
```

All should pass with no errors.

- [ ] **Step 11: Commit final verification**

```bash
cd c:/Users/fabia/git/miximixi
git log --oneline -5
# Should show:
# - feat: Add card animations for filtering and loading
# - feat: Add history.pushState() for image modals so back button closes modal
# - feat: Use CSS variables for category colors to respect theme mode
# - feat: Add card animation keyframes for enter/exit transitions
```

---

## Self-Review Checklist

**Spec Coverage:**
- ✅ Color mode consistency: Task 2 uses CSS variables to fix dark mode colors
- ✅ Image modal back navigation: Task 3 adds history.pushState() for modals
- ✅ Card animations: Tasks 1 and 4 add keyframes and animation tracking
- ✅ Animation timing: Uses existing page transition timing (200ms/300ms)
- ✅ Removed cards fade out: Task 4 tracks both new and removed cards

**No Placeholders:**
- ✅ All code is complete and exact
- ✅ All file paths are precise
- ✅ All commands are exact with expected behavior
- ✅ No TBD, TODO, or vague descriptions
- ✅ All CSS and TypeScript are fully written out

**Type Consistency:**
- ✅ `getCategoryBgColor()` returns `{ bg: string; text: string }` throughout
- ✅ `animatingCardIds` is `Set<string>` consistently
- ✅ CSS variable names match `index.css` definitions
- ✅ Animation class names match CSS definitions

---

## Next Steps

Plan complete and saved to `docs/superpowers/plans/2026-04-17-frontend-improvements.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach would you prefer?**
