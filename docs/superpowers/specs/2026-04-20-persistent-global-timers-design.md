# Persistent Global Timer System — Design Spec

**Date:** 2026-04-20  
**Status:** Approved

---

## Overview

Replace the current per-component, ephemeral timer implementation with a global timer system that persists across page navigation. Timers can be started from both `RecipeDetailPage` and `CookPage`, are grouped by recipe in a header overlay, and continue running when the user navigates away.

---

## Data Model

Each timer is identified by a composite key: `"recipeId:stepIndex"`.

```ts
interface TimerState {
  id: string              // "recipeId:stepIndex"
  recipeId: string
  recipeTitle: string     // used as group headline in overlay
  stepIndex: number
  stepLabel: string       // short step description, ≤30 chars
  totalSeconds: number    // original duration
  remainingSeconds: number // can go negative (overrun)
  isRunning: boolean
  isDone: boolean         // true once it has crossed 0 and bell has rung
  startedAt: number | null // Date.now() snapshot when last resumed (for background correction)
}
```

### Context API

`TimerContext` exposes:

| Function | Description |
|---|---|
| `startTimer(recipeId, stepIndex, stepLabel, recipeTitle, totalSeconds)` | Create or resume a timer |
| `pauseTimer(id)` | Pause a running timer |
| `resumeTimer(id)` | Resume a paused timer |
| `resetTimer(id)` | Reset to `totalSeconds`, stopped |
| `deleteTimer(id)` | Remove timer entirely |
| `adjustTimer(id, deltaSeconds)` | Add/subtract seconds (clamps to 1s minimum when running) |
| `timers` | `Map<string, TimerState>` — the full timer map |

---

## Architecture

### New Files

| File | Purpose |
|---|---|
| `src/context/TimerContext.tsx` | Global store. Holds timer Map, manages intervals, plays bell, handles background correction. |
| `src/components/TimerOverlay.tsx` | Bottom sheet (mobile) / centered modal (desktop). Groups timers by recipe. |
| `src/components/GlobalTimerButton.tsx` | Header icon button. Visible when any timer exists. Shows badge count. |

### Modified Files

| File | Change |
|---|---|
| `src/App.tsx` | Wrap routes in `<TimerProvider>` |
| `src/AppLayout.tsx` | Add `<GlobalTimerButton>` in right header area, left of cook-mode button |
| `src/RecipeDetailPage.tsx` | Rewrite `StepTimer` to read/write `TimerContext` instead of local state. Move `playBell` to context. |
| `src/CookPage.tsx` | Rewrite timer box to read/write `TimerContext` |

---

## Timer Interval Management

- Intervals live in a `useRef<Map<string, ReturnType<typeof setInterval>>>` inside `TimerContext` — never in component state.
- One interval per running timer, started on `resumeTimer`/`startTimer`, cleared on `pauseTimer`/`deleteTimer`/`resetTimer`.
- Intervals tick every 1000ms and decrement `remainingSeconds` by 1. They continue into negative values after crossing 0.
- Bell fires exactly once per timer crossing 0 (guarded by `isDone` flag set atomically with the bell call).
- `playBell` moves from `RecipeDetailPage` into `TimerContext`.

---

## Background Correction (Mobile)

When the app is backgrounded on mobile, JS execution freezes and intervals stop. On return:

1. A `visibilitychange` listener in `TimerContext` fires when `document.visibilityState === 'visible'`.
2. For each running timer, calculate elapsed: `elapsed = Math.floor((Date.now() - startedAt) / 1000)`.
3. Update `remainingSeconds -= elapsed` (can go negative).
4. If any timer crossed 0 during background, set `isDone: true` and play the bell.
5. Reset `startedAt = Date.now()` for all still-running timers.

**Note:** The bell will ring on foreground return, not while backgrounded. Background push notifications are out of scope for v1.

---

## Overrun Behavior

- When `remainingSeconds` crosses 0, the timer continues counting negatively (−0:01, −0:02, …).
- Display format: `−MM:SS` for negative values, `MM:SS` for positive.
- No special color change for negative values.
- The bell rings once at the 0 crossing.
- Timer stays active (counted in badge, shown in overlay) until manually deleted.

---

## Header Icon — `GlobalTimerButton`

- Renders a `timer` Material Symbols icon.
- Hidden (`display: none`) when `timers.size === 0`.
- Shows a small circular badge with the count of all timers (running + paused + done).
- Pulses subtly (CSS animation) when any timer has `isDone: true`.
- Positioned left of the cook-mode button in `AppLayout`'s right header cluster.

---

## Timer Overlay — `TimerOverlay`

### Layout

- **Mobile** (`< md`): bottom sheet sliding up from bottom. Drag handle at top. Backdrop dims page. Closes on backdrop tap or downward drag past threshold.
- **Desktop** (`md+`): centered modal, max-width 480px. Closes on backdrop tap or Escape key.

### Content Structure

```
┌─────────────────────────────┐
│  ⏱ Laufende Timer      ✕   │  ← header + close button
├─────────────────────────────┤
│  Pasta Bolognese            │  ← recipe group headline
│  ┌───────────────────────┐  │
│  │ Schritt 2 · Pasta...  │  │  ← timer card
│  │ −01:23   ▶  Reset     │  │
│  └───────────────────────┘  │
├─────────────────────────────┤
│  Risotto                    │
│  ┌───────────────────────┐  │
│  │ ...                   │  │
│  └───────────────────────┘  │
└─────────────────────────────┘
```

### Delete Interactions

**Touch devices:**
- Swipe left or right on a timer card to reveal a red delete zone.
- Swipe past 60% of card width → timer auto-deletes.
- Release before threshold → card springs back.
- Implemented with `onTouchStart`/`onTouchMove`/`onTouchEnd` handlers and CSS `transform: translateX()`.

**Mouse devices:**
- A small `×` icon button appears in the top-right corner of each timer card on hover.
- Clicking it calls `deleteTimer(id)`.

### Timer Card

Visually consistent with the existing `StepTimer` component in `RecipeDetailPage`. Shows:
- Step label
- Time display (`MM:SS` or `−MM:SS`)
- Play/Pause button
- Reset button
- +1min / −1min adjust buttons

---

## Sync Behavior

All sync is implicit — components read from the same `TimerContext`. Specific cases:

- **RecipeDetailPage → navigate away → return:** `StepTimer` mounts and reads live context state. Timer shows current remaining time.
- **CookPage step navigation:** Moving between steps does not reset timers. Each step's timer box reflects its own context entry. Starting a step that already has a running timer resumes it.
- **Same step open on RecipeDetailPage and CookPage simultaneously:** Both read the same context key — they stay in sync automatically.

---

## Performance

- `StepTimer` components wrapped in `React.memo` — only re-render when their specific timer's data changes.
- `GlobalTimerButton` reads only `timers.size` and `isDone` states — memoized derivation.
- Context functions (`startTimer`, `pauseTimer`, etc.) wrapped in `useCallback` with stable references.
- 1-second tick re-renders are isolated to active timer display components — no scroll jank risk.

---

## Out of Scope (v1)

- Background push notifications when timer finishes while app is backgrounded
- `localStorage` persistence across page refreshes / tab closes
- Cross-tab timer sync
- Multiple timers per step (one timer per `recipeId:stepIndex`)
