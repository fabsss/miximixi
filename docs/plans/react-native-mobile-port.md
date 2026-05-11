# React Native Mobile Port — Miximixi

## Context

The Miximixi recipe app has a fully functional web frontend (React 19 + Vite + Tailwind CSS v4 + React Router v7 + TanStack Query v5) and a FastAPI backend with a clean REST + Bearer JWT API. This document describes the plan to create a native Android/iOS companion app with full feature parity.

Because the backend API is pure REST (no cookies, no CSRF, no SSR), it is already mobile-ready with no backend changes required. CORS does not apply to native HTTP calls.

**Feature branch:** `claude/react-native-mobile-port-WEmSk`

---

## Architecture Decision: Expo Managed Workflow

**Expo SDK 52 + Expo Router v3** (managed workflow) was chosen over bare React Native because every native capability required by this app is available as a first-party Expo SDK module without ejecting:

- `expo-secure-store` — JWT token storage (Keychain/Keystore)
- `expo-av` — Audio playback for timer bell
- `expo-image-picker` — Photo library access for recipe images
- `expo-blur` — Glass/frosted-glass UI effects
- `expo-keep-awake` — Screen-on during cook mode
- `expo-font` — Custom font loading (Noto Serif, Plus Jakarta Sans)
- `expo-splash-screen` — Block render until fonts loaded
- EAS Build — App Store + Play Store distribution

---

## Repository Structure

```
miximixi/
├── frontend/          (existing web app — untouched)
├── backend/           (existing FastAPI — untouched)
├── shared/            (NEW: zero-browser-dep TypeScript)
│   ├── package.json   (@miximixi/shared)
│   ├── tsconfig.json
│   └── src/
│       ├── types.ts             (interfaces shared by web + mobile)
│       ├── api.ts               (HTTP client with StorageAdapter injection)
│       ├── cupConversions.ts    (cup-to-gram conversion utilities)
│       ├── categoryUtils.ts     (category colors and icons)
│       └── constants.ts         (API_BASE_URL)
└── mobile/            (NEW: Expo app)
    ├── app.json
    ├── package.json
    ├── tsconfig.json
    ├── babel.config.js
    ├── tailwind.config.js
    ├── app/                     (Expo Router file-based routes)
    │   ├── _layout.tsx          (root: providers + font loading)
    │   ├── login.tsx
    │   └── (app)/
    │       ├── _layout.tsx      (bottom tab navigator + ProtectedRoute)
    │       ├── index.tsx        (FeedScreen)
    │       ├── recipe/[id].tsx  (RecipeDetailScreen)
    │       ├── cook/[id].tsx    (CookScreen — fullscreen modal)
    │       ├── tags.tsx         (TagsScreen)
    │       └── profile.tsx      (ProfileScreen)
    ├── src/
    │   ├── components/
    │   │   ├── RecipeCard.tsx
    │   │   ├── CategoryChip.tsx
    │   │   ├── HeroCarousel.tsx
    │   │   ├── IngredientRow.tsx
    │   │   ├── StepTimer.tsx
    │   │   ├── TimerSheet.tsx
    │   │   └── MaterialIcon.tsx
    │   ├── context/
    │   │   ├── AuthContext.tsx
    │   │   ├── ThemeContext.tsx
    │   │   └── TimerContext.tsx
    │   ├── hooks/
    │   │   ├── useCategories.ts
    │   │   ├── useDensities.ts
    │   │   └── useInfiniteRecipes.ts
    │   └── theme/
    │       ├── colors.ts
    │       └── typography.ts
    └── assets/
        ├── fonts/
        └── audio/gong.mp3
```

---

## Web → React Native Translation Map

| Web | React Native / Expo |
|---|---|
| React Router v7 | Expo Router v3 |
| `localStorage` (auth token) | `expo-secure-store` |
| `localStorage` / `sessionStorage` | `@react-native-async-storage/async-storage` |
| Tailwind CSS v4 | NativeWind v4 + `StyleSheet` |
| CSS variables (`--mx-*`) | Typed theme object from `ThemeContext` |
| Web Audio API (gong synth) | `expo-av` + bundled `gong.mp3` |
| `IntersectionObserver` | `FlatList` `onEndReached` |
| CSS Grid | `FlatList` `numColumns={2}` |
| Material Symbols | `@expo/vector-icons` MaterialCommunityIcons |
| `qrcode` canvas | `react-native-qrcode-svg` |
| `<input type="file">` | `expo-image-picker` |
| `navigator.wakeLock` | `expo-keep-awake` |
| `backdrop-filter: blur` | `expo-blur` `BlurView` |
| `window.matchMedia` | `useColorScheme()` |
| View Transitions API | Expo Router stack animations |
| `<input type="range">` | `@react-native-community/slider` |
| `confirm()` | `Alert.alert()` |

---

## Shared Package Design

The `shared/` package contains all code with zero browser dependencies. The key refactoring from the web `api.ts` is injecting a `StorageAdapter` interface so the same HTTP logic works in both browser (localStorage) and React Native (SecureStore):

```typescript
interface StorageAdapter {
  getToken(): Promise<string | null>
  setToken(token: string): Promise<void>
  clearToken(): Promise<void>
  onUnauthenticated(): void
}
```

Image upload functions accept `FileInput = File | { uri: string; name: string; type: string }` so the same function works with browser `File` objects and Expo ImagePicker assets.

---

## Theme System

CSS variables replaced with a typed theme object:

```typescript
// mobile/src/theme/colors.ts
export const LightColors = {
  primary: '#a43f14',         // warm rust/terracotta
  surface: '#fff8f4',         // cream background
  onSurface: '#393129',       // dark brown text
  // ... full token set
  cat: {
    vorspeisen:   { bg: '#f3d5a5', text: '#8b5a1a' },
    hauptspeisen: { bg: '#f5d4b3', text: '#8b4a1a' },
    desserts:     { bg: '#e8d4f1', text: '#6a3a6a' },
    brunch:       { bg: '#f5d4de', text: '#7a3a4a' },
    snacks:       { bg: '#d4f1d4', text: '#2d6b2d' },
    drinks:       { bg: '#d4e8f5', text: '#3a5a7a' },
  }
}
```

---

## Navigation Architecture

```
Root Stack (_layout.tsx)
├── /login                       unauthenticated
└── /(app)/_layout.tsx           protected (redirect to /login if no user)
    ├── Bottom Tab Bar
    │   ├── Tab: Feed (index.tsx)
    │   │   └── /recipe/[id]     stack push
    │   │       └── /cook/[id]   modal (href: null on tab bar)
    │   ├── Tab: Tags (tags.tsx)
    │   └── Tab: Profile (profile.tsx)
```

---

## Context Adaptations

### AuthContext
- `expo-secure-store` replaces `localStorage` for token storage
- `router.replace('/login')` replaces `window.location.href = '/login'`
- Context API surface unchanged: `{ user, isLoading, login, logout }`

### ThemeContext
- `AsyncStorage` replaces `localStorage`
- `useColorScheme()` from React Native replaces `window.matchMedia`
- `document.documentElement.setAttribute` removed (no DOM)
- Context API surface unchanged: `{ theme, setTheme, effectiveTheme }`

### TimerContext
- `AsyncStorage` replaces `sessionStorage` (with async hydration)
- `expo-av Audio.Sound` replaces Web Audio API oscillator
- `Audio.setAudioModeAsync({ playsInSilentModeIOS: true })` added for iOS mute switch
- `hydrated` boolean state added to prevent showing stale UI before load
- Timer state machine (deadline-based) ported verbatim

---

## Key Gotchas

1. **AsyncStorage init race (TimerContext)**: Initialize state as empty Map + `hydrated: false`. Show loading skeleton until `hydrated`.
2. **FormData on Android**: Never set `Content-Type` manually for multipart uploads — let RN set the boundary.
3. **expo-av mute switch (iOS)**: `Audio.setAudioModeAsync({ playsInSilentModeIOS: true })` must be called at app startup.
4. **Ingredient ref spans**: Use nested `<Text onPress>` inside `<Text>` for tappable inline spans in step text.
5. **Keyboard on edit screens**: Use `KeyboardAvoidingView` / `KeyboardAwareScrollView`; RN's built-in is fragile on Android.

---

## Test Suite

Tests are organized into:
- `shared/src/__tests__/` — unit tests: cupConversions, categoryUtils, api adapter
- `mobile/src/__tests__/` — context tests: Auth, Theme, Timer; hook tests
- `mobile/src/components/__tests__/` — component render tests
- `mobile/app/__tests__/` — screen-level tests
- `mobile/src/__tests__/integration/` — integration flows

**Framework**: Jest + `@testing-library/react-native` via `jest-expo` preset.

### Coverage Matrix

| Area | Test File | Key Assertions |
|---|---|---|
| Cup conversions | `cupConversions.test.ts` | known input→output pairs for all functions |
| Category utils | `categoryUtils.test.ts` | all 6 categories return correct colors + icons |
| API adapter | `api.test.ts` | 200 success, 401 triggers onUnauthenticated, token injected |
| AuthContext | `AuthContext.test.tsx` | login stores token, logout clears, 401 redirects |
| ThemeContext | `ThemeContext.test.tsx` | system default, explicit persist, effectiveTheme resolution |
| TimerContext | `TimerContext.test.tsx` | start/pause/resume/adjust, isDone at 0, bell fires once |
| RecipeCard | `RecipeCard.test.tsx` | title renders, favorite icon on rating=1, onPress called |
| CategoryChip | `CategoryChip.test.tsx` | all 6 categories render correct label/color |
| StepTimer | `StepTimer.test.tsx` | countdown display, start/pause/adjust buttons |
| LoginScreen | `login.test.tsx` | inputs, submit calls login(), error shown, remember-me |
| FeedScreen | `index.test.tsx` | grid renders, search filters, pagination triggered |
| RecipeDetail | `recipe/[id].test.tsx` | metadata, scaling, cook button nav, delete alert |
| CookScreen | `cook/[id].test.tsx` | step text, timer controls, keepawake on mount |
| TagsScreen | `tags.test.tsx` | tag list, multi-select, merge mutation |
| ProfileScreen | `profile.test.tsx` | user info, logout, QR code, Telegram links |
| Auth flow | `auth-flow.test.tsx` | login → protected access → 401 → login redirect |
| Timer bell | `timer-bell.test.tsx` | countdown to 0 → replayAsync called once |
| Image upload | `image-upload.test.tsx` | picker asset → correct FormData shape → request fired |
| Translation | `translation.test.tsx` | POST /translate → UI updated with translated content |

---

## Implementation Steps

1. **shared/** — scaffold package, copy types/utilities, refactor api.ts with StorageAdapter
2. **mobile/** — `create-expo-app`, install deps, configure NativeWind + Babel
3. **Theme** — `colors.ts`, `typography.ts` from CSS variable values
4. **Contexts** — AuthContext, ThemeContext, TimerContext (native adapters)
5. **Root layout** — providers, font loading, splash screen
6. **LoginScreen** — TextInput email/password, remember-me, login mutation
7. **FeedScreen** — FlatList grid, HeroCarousel, SearchBar, CategoryPills, TagChips, favorites
8. **RecipeDetailScreen** — metadata, ingredients (scaling), steps, rating, edit mode, image upload
9. **CookScreen** — fullscreen steps, timers, keepawake, TimerSheet bottom sheet
10. **TagsScreen** — tag list with counts, multi-select, merge
11. **ProfileScreen** — user info, Telegram QR, linked devices, logout
12. **Tests** — full suite for all of the above
13. **Commit + push** to `claude/react-native-mobile-port-WEmSk`

---

## Dependencies

See `mobile/package.json` for the full list. Key packages:

```
expo ~52, expo-router ~4, react-native 0.76.x
@tanstack/react-query ^5, expo-secure-store, @react-native-async-storage/async-storage
expo-av, expo-image-picker, expo-blur, expo-font, expo-keep-awake
nativewind ^4, tailwindcss ^3
react-native-reanimated, react-native-gesture-handler, react-native-screens
@expo/vector-icons, @react-native-community/slider, @react-native-picker/picker
@gorhom/bottom-sheet, react-native-qrcode-svg, react-native-svg
```

---

*Last updated: 2026-05-11*
*Branch: claude/react-native-mobile-port-WEmSk*
