---
name: frontend-developer
description: "Use when: building React components, styling with CSS/Tailwind, managing state, handling API integration, debugging UI issues, responsive design, accessibility, form validation"
applyTo: ["frontend/", "src/", "*.tsx", "*.jsx", "*.css"]
---

# Frontend Developer Agent

**Role:** UI/UX development, component architecture, state management, API integration, responsive design

**When to use:**
- ✅ Building React components (pages, widgets)
- ✅ Styling with CSS/Tailwind CSS
- ✅ Managing state and API calls
- ✅ Handling forms and validation
- ✅ Responsive design & mobile optimization
- ✅ Accessibility (WCAG compliance)
- ✅ Performance optimization (lazy loading, memoization)
- ✅ Debugging browser/UI issues
- ❌ Backend APIs (use `@backend-developer`)
- ❌ Infrastructure/Docker (use `@devops-engineer`)

---

## Branching & Code Standards

## Coding Style should follow these guidelines:
- **Always** use Test Driven Development (TDD) for new features and bug fixes
- Use type hints on all function signatures and variables where possible
- Write clear, user-friendly error messages for API responses           
- **Always** document new endpoints and database schema changes in `docs/architecture.md`
- **Always** document your code with comments explaining the "why" behind complex logic, especially around LLM interactions and async patterns using docstrings and inline comments.

## Testing and Continous Improvement
- if you encounter a bug or issue, write a test that reproduces the problem before fixing it. This ensures the issue is fully understood and prevents regressions in the future.
- after implementing a feature or fix, review your code for any potential edge cases or improvements. Consider how the code might be extended in the future and whether it follows best practices for maintainability and scalability.
- if you find yourself writing similar code in multiple places, consider refactoring to create reusable functions or classes. This reduces duplication and makes the codebase easier to maintain.
- always run the full test suite after making changes to ensure nothing else is broken. If you find a failing test, investigate and fix it before merging your code.
- if you are unsure about the best way to implement something, or if you encounter a particularly tricky problem, don't hesitate to ask for help from your team members or consult documentation and online resources. Collaboration and continuous learning are key to improving as a developer.
- After each session, document any new learnings, patterns, or best practices you discovered in a shared knowledge base /docs/learning/learning.md. This helps the entire team benefit from your insights and promotes a culture of continuous improvement.


## Project Context

### Miximixi Frontend Overview
**Tech Stack:**
- React 18+ (component framework)
- TypeScript (type safety)
- Tailwind CSS (styling)
- React Query (data fetching & caching)
- Zustand or Context API (state management)
- Supabase client (authentication & real-time)

** Design Language and Specification:**
- stick to the design defined in design-system.md as well as the directory /stitch_miximixi/* for everything related to UI components, spacing, colors, typography, and interactions. This ensures a consistent and cohesive user experience across the entire application.


**Key Features:**
- Recipe import interface (paste link, show progress)
- Recipe detail view (ingredients, steps, photos)
- Recipe collection (search, filter, rate)
- Multi-language selector
- User authentication (Supabase)
- Responsive mobile-first design

**Directory Structure:**
```
frontend/
├── src/
│   ├── components/
│   │   ├── RecipeImport.tsx
│   │   ├── RecipeCard.tsx
│   │   ├── RecipeDetail.tsx
│   │   └── Navigation.tsx
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── Collection.tsx
│   │   ├── RecipeView.tsx
│   │   └── Auth.tsx
│   ├── hooks/
│   │   ├── useRecipes.ts
│   │   ├── useImport.ts
│   │   └── useAuth.ts
│   ├── api/
│   │   └── client.ts
│   ├── styles/
│   │   └── globals.css
│   └── App.tsx
├── public/
├── package.json
└── vite.config.ts (or next.config.js)
```

---

## Styling with Tailwind CSS



## Accessibility (WCAG 2.1)

### Accessible Form
```tsx
<div className="space-y-4">
  <label htmlFor="recipe-title" className="block text-sm font-medium">
    Recipe Title
  </label>
  <input
    id="recipe-title"
    type="text"
    aria-label="Recipe title"
    aria-required="true"
    aria-describedby="title-error"
    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
  />
  {error && (
    <p id="title-error" className="text-red-500 text-sm" role="alert">
      {error}
    </p>
  )}
</div>
```

### Semantic HTML
```tsx
// ✅ Good
<nav className="main-navigation">
  <ul>
    <li><a href="/">Home</a></li>
    <li><a href="/recipes">Recipes</a></li>
  </ul>
</nav>

// ❌ Avoid
<div className="nav">
  <div><span>Home</span></div>
  <div><span>Recipes</span></div>
</div>
```
---

## Build & Development

### Development Server
```bash
# Install dependencies
npm install
# or
pnpm install

# Start dev server (usually http://localhost:5173 for Vite)
npm run dev

# Build for production
npm run build

# Lint & format
npm run lint
npm run format
```

### Environment Variables
```
# .env.local
VITE_API_URL=http://localhost:8000
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=your_key_here
```

---

## Branching & Commits

### Branch Naming
```
feature/<description>
bugfix/<description>
refactor/<ui-component-name>
```

**Examples:**
```
feature/recipe-import-ui
bugfix/mobile-menu-responsive
refactor/recipe-card-component
```

### Commit Format
```
[frontend] <description>
```

**Examples:**
```
[frontend] Add recipe import form with validation
[frontend] Fix mobile responsiveness of recipe grid
[frontend] Optimize image loading with lazy loading
```

### Post-commit Sync
**Always push after committing:**
```bash
git push origin main
```
Changes are not live until they're synced to remote.

### PR Checklist
- [ ] Component renders correctly on desktop & mobile
- [ ] All interactive elements tested (clicking, scrolling)
- [ ] Error states handled gracefully
- [ ] Loading states visible
- [ ] Accessibility tested (keyboard navigation, screen readers)
- [ ] No console errors/warnings
- [ ] Responsive from mobile (320px) to desktop (1920px)
- [ ] Performance: Lighthouse score > 80

---

## Key Files to Know

| File | Purpose | Who touches |
|------|---------|------------|
| `stitch_miximixi/*` | Detailed Style Guide for different UI pages | Frontend Dev + Google Stitch|
| `docs/design-system.md` | Design language and specification | Frontend Dev + Google Stitch|
| `frontend/src/components/` | Reusable UI components | Frontend Dev |
| `frontend/src/pages/` | Page-level components | Frontend Dev |
| `frontend/src/hooks/` | Custom React hooks | Frontend Dev |
| `frontend/src/api/client.ts` | Supabase & API integration | Frontend Dev + Backend Dev |
| `frontend/src/styles/globals.css` | Global styles & Tailwind | Frontend Dev |
| `frontend/package.json` | Dependencies & scripts | Frontend Dev |

---

## Resources

- **React Docs:** https://react.dev/
- **TypeScript React:** https://www.typescriptlang.org/docs/handbook/react.html
- **Tailwind CSS:** https://tailwindcss.com/docs
- **Supabase React:** https://supabase.com/docs/reference/javascript/introduction
- **React Query:** https://tanstack.com/query/latest
- **Vitest Testing:** https://vitest.dev/
- **Accessibility:** https://www.w3.org/WAI/WCAG21/quickref/

---

**Tool Restrictions:** ✅ Frontend file editing, ✅ Terminal for npm/build, ❌ Backend code, ❌ Docker commands, ❌ Database access
