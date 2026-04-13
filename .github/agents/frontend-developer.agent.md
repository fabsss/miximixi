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

## Project Context

### Miximixi Frontend Overview
**Tech Stack:**
- React 18+ (component framework)
- TypeScript (type safety)
- Tailwind CSS (styling)
- React Query (data fetching & caching)
- Zustand or Context API (state management)
- Supabase client (authentication & real-time)

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

## Component Building Patterns

### Recipe Import Component
```tsx
// src/components/RecipeImport.tsx
import React, { useState } from 'react';
import { useImportRecipe } from '../hooks/useImport';

interface RecipeImportProps {
  onSuccess: (recipeId: string) => void;
  onError: (error: string) => void;
}

export const RecipeImport: React.FC<RecipeImportProps> = ({ onSuccess, onError }) => {
  const [link, setLink] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { importRecipe } = useImportRecipe();

  const handleImport = async () => {
    if (!link.trim()) {
      onError('Please enter a valid Instagram link');
      return;
    }

    setIsLoading(true);
    try {
      const response = await importRecipe(link);
      onSuccess(response.recipe_id);
      setLink(''); // Clear input
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Import failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-4">Import Recipe</h2>
      
      <input
        type="text"
        value={link}
        onChange={(e) => setLink(e.target.value)}
        placeholder="Paste Instagram link..."
        className="w-full px-4 py-2 border border-gray-300 rounded mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
        disabled={isLoading}
      />

      <button
        onClick={handleImport}
        disabled={isLoading || !link.trim()}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
      >
        {isLoading ? 'Importing...' : 'Import'}
      </button>
    </div>
  );
};
```

### Recipe Card Component
```tsx
// src/components/RecipeCard.tsx
import React from 'react';
import { Recipe } from '../types';

interface RecipeCardProps {
  recipe: Recipe;
  onClick: () => void;
}

export const RecipeCard: React.FC<RecipeCardProps> = ({ recipe, onClick }) => {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer overflow-hidden"
    >
      {recipe.photo_url && (
        <img
          src={recipe.photo_url}
          alt={recipe.title}
          className="w-full h-48 object-cover"
        />
      )}
      
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-2 truncate">{recipe.title}</h3>
        
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>{recipe.ingredient_count} ingredients</span>
          <span className="flex items-center gap-1">
            ⭐ {recipe.rating ? recipe.rating.toFixed(1) : 'N/A'}
          </span>
        </div>

        {recipe.language && (
          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded mt-2 inline-block">
            {recipe.language}
          </span>
        )}
      </div>
    </div>
  );
};
```

---

## API Integration Pattern

### Custom Hook: useRecipes
```tsx
// src/hooks/useRecipes.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../api/client';
import { Recipe } from '../types';

export const useRecipes = () => {
  const queryClient = useQueryClient();

  // Fetch all recipes for current user
  const fetchRecipes = async (): Promise<Recipe[]> => {
    const { data, error } = await supabase
      .from('recipes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  };

  // Query: Get all recipes
  const { data: recipes, isLoading, error: fetchError } = useQuery({
    queryKey: ['recipes'],
    queryFn: fetchRecipes,
  });

  // Mutation: Update recipe rating
  const updateRatingMutation = useMutation({
    mutationFn: async ({ recipeId, rating }: { recipeId: string; rating: number }) => {
      const { error } = await supabase
        .from('recipes')
        .update({ rating })
        .eq('id', recipeId);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      // Invalidate cache to refetch
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
    },
    onError: (error: Error) => {
      console.error('Rating update failed:', error);
    },
  });

  return {
    recipes: recipes || [],
    isLoading,
    error: fetchError,
    updateRating: updateRatingMutation.mutate,
  };
};
```

### Custom Hook: useAuth
```tsx
// src/hooks/useAuth.ts
import { useEffect, useState } from 'react';
import { supabase } from '../api/client';
import { User, Session } from '@supabase/supabase-js';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user || null);
      setIsLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user || null);
    });

    return () => subscription?.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return {
    user,
    session,
    isLoading,
    signUp,
    signIn,
    signOut,
    isAuthenticated: !!session,
  };
};
```

---

## Styling with Tailwind CSS

### Responsive Design Pattern
```tsx
// Component with mobile-first responsive design
<div className="
  grid grid-cols-1        // Mobile: 1 column
  sm:grid-cols-2          // Small screens: 2 columns
  lg:grid-cols-3          // Large screens: 3 columns
  xl:grid-cols-4          // Extra large: 4 columns
  gap-4
  p-4 md:p-8 lg:p-12      // Responsive padding
">
  {recipes.map(recipe => (
    <RecipeCard key={recipe.id} recipe={recipe} />
  ))}
</div>
```

### Dark Mode Support
```tsx
// Add to globals.css
@media (prefers-color-scheme: dark) {
  :root {
    --background: 0 0% 10%;
    --foreground: 0 0% 95%;
  }
}

// In component
<div className="dark:bg-slate-900 dark:text-white bg-white text-black">
  Content
</div>
```

---

## Form Validation

### Recipe Edit Form
```tsx
// src/components/RecipeEditForm.tsx
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Recipe } from '../types';

interface RecipeEditFormProps {
  recipe: Recipe;
  onSave: (updated: Recipe) => void;
}

export const RecipeEditForm: React.FC<RecipeEditFormProps> = ({ recipe, onSave }) => {
  const { register, handleSubmit, formState: { errors } } = useForm<Recipe>({
    defaultValues: recipe,
  });

  const onSubmit = (data: Recipe) => {
    // Validation happens here via react-hook-form
    onSave(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Title *</label>
        <input
          {...register('title', { required: 'Title is required', minLength: 3 })}
          className="w-full px-3 py-2 border border-gray-300 rounded"
        />
        {errors.title && <p className="text-red-500 text-sm">{errors.title.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Ingredients (comma-separated)</label>
        <textarea
          {...register('ingredients_text')}
          className="w-full px-3 py-2 border border-gray-300 rounded font-mono text-sm"
          rows={4}
          placeholder="e.g. 400g pasta, 200g cheese, ..."
        />
      </div>

      <button
        type="submit"
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Save Recipe
      </button>
    </form>
  );
};
```

---

## State Management Pattern (Zustand)

### Recipe Store
```typescript
// src/store/recipeStore.ts
import { create } from 'zustand';
import { Recipe } from '../types';

interface RecipeStore {
  selectedRecipe: Recipe | null;
  filters: {
    language?: string;
    minRating?: number;
    searchQuery?: string;
  };
  setSelectedRecipe: (recipe: Recipe | null) => void;
  setFilters: (filters: RecipeStore['filters']) => void;
  clearFilters: () => void;
}

export const useRecipeStore = create<RecipeStore>((set) => ({
  selectedRecipe: null,
  filters: {},
  setSelectedRecipe: (recipe) => set({ selectedRecipe: recipe }),
  setFilters: (filters) => set((state) => ({ 
    filters: { ...state.filters, ...filters }
  })),
  clearFilters: () => set({ filters: {} }),
}));
```

---

## Performance Optimization

### Memoization Pattern
```tsx
// Use React.memo for expensive components
const RecipeCard = React.memo(
  ({ recipe, onClick }: RecipeCardProps) => (
    <div onClick={onClick} className="...">
      {/* Card content */}
    </div>
  ),
  // Custom comparison for props
  (prevProps, nextProps) => {
    return prevProps.recipe.id === nextProps.recipe.id;
  }
);
```

### Lazy Loading Images
```tsx
<img
  src={recipe.photo_url}
  alt={recipe.title}
  loading="lazy"
  className="w-full h-48 object-cover"
/>
```

### Code Splitting
```typescript
// src/App.tsx
import { lazy, Suspense } from 'react';

const RecipeCollection = lazy(() => import('./pages/Collection'));

export function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RecipeCollection />
    </Suspense>
  );
}
```

---

## Testing Components

### Component Test (Vitest)
```typescript
// src/components/__tests__/RecipeCard.test.tsx
import { render, screen } from '@testing-library/react';
import { RecipeCard } from '../RecipeCard';
import { Recipe } from '../../types';

describe('RecipeCard', () => {
  const mockRecipe: Recipe = {
    id: '1',
    title: 'Pasta Carbonara',
    ingredient_count: 4,
    rating: 4.5,
    photo_url: 'https://example.com/photo.jpg',
  };

  it('renders recipe title', () => {
    render(<RecipeCard recipe={mockRecipe} onClick={() => {}} />);
    expect(screen.getByText('Pasta Carbonara')).toBeInTheDocument();
  });

  it('displays ingredient count', () => {
    render(<RecipeCard recipe={mockRecipe} onClick={() => {}} />);
    expect(screen.getByText('4 ingredients')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = jest.fn();
    const { container } = render(
      <RecipeCard recipe={mockRecipe} onClick={onClick} />
    );
    container.firstChild?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClick).toHaveBeenCalled();
  });
});
```

---

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

## Responsive Mobile Design

### Mobile Menu Pattern
```tsx
import { useEffect, useState } from 'react';

export const Navbar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="bg-white shadow">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between h-16">
          {/* Logo */}
          <div className="flex items-center font-bold text-2xl">Miximixi</div>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-4">
            <a href="/" className="text-gray-700 hover:text-blue-600">Home</a>
            <a href="/collection" className="text-gray-700 hover:text-blue-600">Collection</a>
            <a href="/settings" className="text-gray-700 hover:text-blue-600">Settings</a>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden items-center">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-gray-700 hover:text-blue-600"
            >
              ☰
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isOpen && (
          <div className="md:hidden pb-4 space-y-2">
            <a href="/" className="block text-gray-700 hover:text-blue-600 py-2">Home</a>
            <a href="/collection" className="block text-gray-700 hover:text-blue-600 py-2">Collection</a>
            <a href="/settings" className="block text-gray-700 hover:text-blue-600 py-2">Settings</a>
          </div>
        )}
      </div>
    </nav>
  );
};
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
