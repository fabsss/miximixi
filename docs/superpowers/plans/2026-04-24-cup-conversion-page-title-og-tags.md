# Cup-Konvertierung, Dynamischer Seitentitel, Open Graph Tags – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cups werden für bestimmte Zutaten in Gramm umgerechnet (mit ml in Klammern), alle Seiten erhalten dynamische Browser-Titel, und Rezeptlinks erzeugen schöne Messenger-Previews mit Bild und Titel.

**Architecture:** Feature 1 nutzt eine neue DB-Tabelle für Zutaten-Dichten, einen Read-only-API-Endpoint und einen erweiterten Frontend-Konvertierungslogik. Feature 2 ist ein minimaler `useDocumentTitle`-Hook ohne externe Library. Feature 3 kombiniert einen neuen FastAPI-Endpoint für OG-HTML mit einer Nginx-User-Agent-Detection im Frontend-Container.

**Tech Stack:** FastAPI, psycopg2, PostgreSQL, React 19, TypeScript, Vitest, @testing-library/react, Nginx

---

## Dateiübersicht

| Datei | Aktion | Verantwortlichkeit |
|-------|--------|-------------------|
| `backend/migrations/014_ingredient_densities.sql` | Erstellen | Neue Tabellen + Seed-Daten |
| `backend/tests/functional/test_ingredient_densities.py` | Erstellen | Tests für GET /ingredient-densities |
| `backend/tests/functional/test_og_endpoint.py` | Erstellen | Tests für GET /og/recipes/{slug} |
| `backend/app/main.py` | Modifizieren | 2 neue Endpoints hinzufügen |
| `frontend/src/lib/cupConversions.ts` | Erstellen | Typen + findDensityForIngredient() |
| `frontend/src/lib/cupConversions.test.ts` | Erstellen | Unit-Tests für Konvertierungslogik |
| `frontend/src/lib/useDensities.ts` | Erstellen | React-Query-Hook für /ingredient-densities |
| `frontend/src/lib/useDocumentTitle.ts` | Erstellen | Hook für document.title |
| `frontend/src/lib/useDocumentTitle.test.ts` | Erstellen | Unit-Tests für useDocumentTitle |
| `frontend/src/pages/RecipeDetailPage.tsx` | Modifizieren | getDisplayAmount() erweitern, Hooks einbinden |
| `frontend/src/pages/FeedPage.tsx` | Modifizieren | useDocumentTitle einbinden |
| `frontend/src/pages/TagsPage.tsx` | Modifizieren | useDocumentTitle einbinden |
| `frontend/src/pages/CookPage.tsx` | Modifizieren | useDocumentTitle einbinden |
| `frontend/src/lib/api.ts` | Modifizieren | getDensities() Funktion hinzufügen |
| `frontend/nginx.conf` | Modifizieren | Bot-User-Agent-Routing für /recipes/ |

---

## Task 1: Datenbank-Migration für Zutaten-Dichten

**Files:**
- Create: `backend/migrations/014_ingredient_densities.sql`

- [ ] **Schritt 1: Migration-Datei erstellen**

```sql
-- 014_ingredient_densities.sql
-- Zutatendichten für Cup-zu-Gramm-Konvertierung

CREATE TABLE ingredient_density_types (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_name        TEXT NOT NULL UNIQUE,
    display_name     TEXT,
    density_g_per_ml NUMERIC NOT NULL
);

CREATE TABLE ingredient_density_keywords (
    id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_id  UUID NOT NULL REFERENCES ingredient_density_types(id) ON DELETE CASCADE,
    keyword  TEXT NOT NULL UNIQUE
);

CREATE INDEX idx_ingredient_density_keywords_type_id ON ingredient_density_keywords(type_id);

-- Seed: Typen
INSERT INTO ingredient_density_types (id, type_name, display_name, density_g_per_ml) VALUES
  (gen_random_uuid(), 'flour',          'Mehl / Flour',               0.593),
  (gen_random_uuid(), 'sugar',          'Zucker / Sugar',             0.845),
  (gen_random_uuid(), 'powdered_sugar', 'Puderzucker / Icing Sugar',  0.560),
  (gen_random_uuid(), 'butter',         'Butter / Margarine',         0.911),
  (gen_random_uuid(), 'breadcrumbs',    'Semmelbrösel / Breadcrumbs', 0.370),
  (gen_random_uuid(), 'oats',           'Haferflocken / Oats',        0.340),
  (gen_random_uuid(), 'cocoa',          'Kakao / Cocoa Powder',       0.520),
  (gen_random_uuid(), 'rice',           'Reis / Rice',                0.780),
  (gen_random_uuid(), 'salt',           'Salz / Salt',                1.217);

-- Seed: Keywords
INSERT INTO ingredient_density_keywords (id, type_id, keyword)
SELECT gen_random_uuid(), id, k FROM ingredient_density_types, unnest(ARRAY[
  'mehl','weizenmehl','flour','all-purpose flour','dinkelmehl','spelt flour',
  'roggenmehl','rye flour','vollkornmehl','whole wheat flour',
  'backpulver','baking powder','natron','baking soda',
  'stärke','speisestärke','cornstarch','corn starch','maisstärke',
  'kartoffelstärke','potato starch'
]) AS k WHERE type_name = 'flour';

INSERT INTO ingredient_density_keywords (id, type_id, keyword)
SELECT gen_random_uuid(), id, k FROM ingredient_density_types, unnest(ARRAY[
  'zucker','sugar','kristallzucker','granulated sugar',
  'brauner zucker','brown sugar','rohrzucker','cane sugar',
  'vanillezucker','vanilla sugar'
]) AS k WHERE type_name = 'sugar';

INSERT INTO ingredient_density_keywords (id, type_id, keyword)
SELECT gen_random_uuid(), id, k FROM ingredient_density_types, unnest(ARRAY[
  'puderzucker','powdered sugar','icing sugar','confectioners sugar','staubzucker'
]) AS k WHERE type_name = 'powdered_sugar';

INSERT INTO ingredient_density_keywords (id, type_id, keyword)
SELECT gen_random_uuid(), id, k FROM ingredient_density_types, unnest(ARRAY[
  'butter','margarine','pflanzenmargarine','vegane butter','vegan butter'
]) AS k WHERE type_name = 'butter';

INSERT INTO ingredient_density_keywords (id, type_id, keyword)
SELECT gen_random_uuid(), id, k FROM ingredient_density_types, unnest(ARRAY[
  'semmelbrösel','semmelbröseln','breadcrumbs','paniermehl','bread crumbs','panko'
]) AS k WHERE type_name = 'breadcrumbs';

INSERT INTO ingredient_density_keywords (id, type_id, keyword)
SELECT gen_random_uuid(), id, k FROM ingredient_density_types, unnest(ARRAY[
  'haferflocken','oats','rolled oats','instant oats','porridge oats',
  'zartblatt haferflocken','kernige haferflocken'
]) AS k WHERE type_name = 'oats';

INSERT INTO ingredient_density_keywords (id, type_id, keyword)
SELECT gen_random_uuid(), id, k FROM ingredient_density_types, unnest(ARRAY[
  'kakao','cocoa','cocoa powder','kakaopulver','backkakao',
  'dutch process cocoa','unsweetened cocoa'
]) AS k WHERE type_name = 'cocoa';

INSERT INTO ingredient_density_keywords (id, type_id, keyword)
SELECT gen_random_uuid(), id, k FROM ingredient_density_types, unnest(ARRAY[
  'reis','rice','langkornreis','long grain rice','rundkornreis',
  'short grain rice','jasminreis','jasmine rice','basmatireis','basmati rice',
  'risottoreis','risotto rice'
]) AS k WHERE type_name = 'rice';

INSERT INTO ingredient_density_keywords (id, type_id, keyword)
SELECT gen_random_uuid(), id, k FROM ingredient_density_types, unnest(ARRAY[
  'salz','salt','meersalz','sea salt','tafelsalz','table salt',
  'grobes salz','coarse salt','fleur de sel'
]) AS k WHERE type_name = 'salt';
```

- [ ] **Schritt 2: Migration in der Test-DB ausführen**

```bash
cd backend
psql postgresql://miximixi:miximixi@localhost:5432/miximixi_test \
  -f migrations/014_ingredient_densities.sql
```

Erwartete Ausgabe: `CREATE TABLE`, `CREATE TABLE`, `CREATE INDEX`, `INSERT 0 9`, dann mehrere `INSERT 0 N`

- [ ] **Schritt 3: Commit**

```bash
git add backend/migrations/014_ingredient_densities.sql
git commit -m "feat: add ingredient_density_types and keywords migration with seed data"
```

---

## Task 2: Backend-Endpoint GET /ingredient-densities (TDD)

**Files:**
- Create: `backend/tests/functional/test_ingredient_densities.py`
- Modify: `backend/app/main.py`

- [ ] **Schritt 1: Test schreiben (failing)**

```python
# backend/tests/functional/test_ingredient_densities.py
import pytest
from unittest.mock import MagicMock, patch


@pytest.fixture
def mock_density_client(client, monkeypatch):
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value = mock_cursor

    def mock_get_db():
        return mock_conn

    monkeypatch.setattr("app.main.get_db", mock_get_db)
    return client, mock_cursor


class TestIngredientDensitiesEndpoint:
    def test_returns_list(self, mock_density_client):
        client, mock_cursor = mock_density_client
        mock_cursor.fetchall.return_value = [
            {
                "type_name": "flour",
                "display_name": "Mehl / Flour",
                "density_g_per_ml": 0.593,
                "keywords": ["mehl", "weizenmehl", "flour"],
            }
        ]
        response = client.get("/ingredient-densities")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1

    def test_response_schema(self, mock_density_client):
        client, mock_cursor = mock_density_client
        mock_cursor.fetchall.return_value = [
            {
                "type_name": "sugar",
                "display_name": "Zucker / Sugar",
                "density_g_per_ml": 0.845,
                "keywords": ["zucker", "sugar"],
            }
        ]
        response = client.get("/ingredient-densities")
        assert response.status_code == 200
        item = response.json()[0]
        assert "type_name" in item
        assert "display_name" in item
        assert "density_g_per_ml" in item
        assert "keywords" in item
        assert isinstance(item["keywords"], list)

    def test_empty_db_returns_empty_list(self, mock_density_client):
        client, mock_cursor = mock_density_client
        mock_cursor.fetchall.return_value = []
        response = client.get("/ingredient-densities")
        assert response.status_code == 200
        assert response.json() == []
```

- [ ] **Schritt 2: Test ausführen und sicherstellen dass er fehlschlägt**

```bash
cd backend
poetry run pytest tests/functional/test_ingredient_densities.py -v
```

Erwartete Ausgabe: `FAILED` mit `404` oder `connection error` (Endpoint existiert noch nicht)

- [ ] **Schritt 3: Endpoint in main.py implementieren**

In `backend/app/main.py` direkt nach dem `/health`-Endpoint (ca. Zeile 200) einfügen:

```python
@app.get("/ingredient-densities")
async def get_ingredient_densities():
    """Liefert alle Zutatendichte-Typen mit Keywords für Cup-zu-Gramm-Konvertierung."""
    db = get_db()
    cursor = db.cursor(cursor_factory=RealDictCursor)
    try:
        cursor.execute("""
            SELECT
                t.type_name,
                t.display_name,
                t.density_g_per_ml::float AS density_g_per_ml,
                array_agg(k.keyword ORDER BY k.keyword) AS keywords
            FROM ingredient_density_types t
            LEFT JOIN ingredient_density_keywords k ON k.type_id = t.id
            GROUP BY t.id, t.type_name, t.display_name, t.density_g_per_ml
            ORDER BY t.type_name
        """)
        rows = cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        cursor.close()
        db.close()
```

- [ ] **Schritt 4: Tests ausführen und sicherstellen dass sie bestehen**

```bash
cd backend
poetry run pytest tests/functional/test_ingredient_densities.py -v
```

Erwartete Ausgabe: `3 passed`

- [ ] **Schritt 5: Commit**

```bash
git add backend/app/main.py backend/tests/functional/test_ingredient_densities.py
git commit -m "feat: add GET /ingredient-densities endpoint with TDD"
```

---

## Task 3: Frontend-Typen und Konvertierungslogik (TDD)

**Files:**
- Create: `frontend/src/lib/cupConversions.ts`
- Create: `frontend/src/lib/cupConversions.test.ts`

- [ ] **Schritt 1: Typen-Datei erstellen**

```typescript
// frontend/src/lib/cupConversions.ts

export interface DensityType {
  type_name: string
  display_name: string | null
  density_g_per_ml: number
  keywords: string[]
}

const CUP_UNITS = new Set(['cup', 'cups', 'tasse', 'tassen'])
const ML_PER_CUP = 236.588

export function isCupUnit(unit: string | null | undefined): boolean {
  return CUP_UNITS.has(unit?.toLowerCase() ?? '')
}

export function findDensityForIngredient(
  name: string,
  densities: DensityType[],
): DensityType | null {
  const lowerName = name.toLowerCase()
  for (const density of densities) {
    for (const keyword of density.keywords) {
      if (lowerName.includes(keyword.toLowerCase())) {
        return density
      }
    }
  }
  return null
}

export function convertCupToGram(
  amount: number,
  density: DensityType,
): { grams: number; ml: number } {
  const ml = amount * ML_PER_CUP
  const grams = ml * density.density_g_per_ml
  return { grams, ml }
}
```

- [ ] **Schritt 2: Tests schreiben (failing)**

```typescript
// frontend/src/lib/cupConversions.test.ts
import { describe, it, expect } from 'vitest'
import {
  isCupUnit,
  findDensityForIngredient,
  convertCupToGram,
  type DensityType,
} from './cupConversions'

const FLOUR: DensityType = {
  type_name: 'flour',
  display_name: 'Mehl / Flour',
  density_g_per_ml: 0.593,
  keywords: ['mehl', 'weizenmehl', 'flour', 'all-purpose flour'],
}

const SUGAR: DensityType = {
  type_name: 'sugar',
  display_name: 'Zucker / Sugar',
  density_g_per_ml: 0.845,
  keywords: ['zucker', 'sugar'],
}

const ALL_DENSITIES = [FLOUR, SUGAR]

describe('isCupUnit', () => {
  it('recognizes cup', () => expect(isCupUnit('cup')).toBe(true))
  it('recognizes cups', () => expect(isCupUnit('cups')).toBe(true))
  it('recognizes tasse', () => expect(isCupUnit('tasse')).toBe(true))
  it('recognizes tassen', () => expect(isCupUnit('tassen')).toBe(true))
  it('is case-insensitive', () => expect(isCupUnit('Cup')).toBe(true))
  it('rejects ml', () => expect(isCupUnit('ml')).toBe(false))
  it('rejects null', () => expect(isCupUnit(null)).toBe(false))
  it('rejects undefined', () => expect(isCupUnit(undefined)).toBe(false))
})

describe('findDensityForIngredient', () => {
  it('finds flour by keyword "mehl"', () => {
    expect(findDensityForIngredient('Mehl', ALL_DENSITIES)).toBe(FLOUR)
  })
  it('finds flour for "Weizenmehl Type 405"', () => {
    expect(findDensityForIngredient('Weizenmehl Type 405', ALL_DENSITIES)).toBe(FLOUR)
  })
  it('finds sugar by keyword "zucker"', () => {
    expect(findDensityForIngredient('Zucker', ALL_DENSITIES)).toBe(SUGAR)
  })
  it('is case-insensitive', () => {
    expect(findDensityForIngredient('MEHL', ALL_DENSITIES)).toBe(FLOUR)
  })
  it('returns null for unknown ingredient', () => {
    expect(findDensityForIngredient('Olivenöl', ALL_DENSITIES)).toBeNull()
  })
  it('returns null for empty densities list', () => {
    expect(findDensityForIngredient('mehl', [])).toBeNull()
  })
})

describe('convertCupToGram', () => {
  it('converts 1 cup flour correctly', () => {
    const { grams, ml } = convertCupToGram(1, FLOUR)
    expect(ml).toBeCloseTo(236.588, 2)
    expect(grams).toBeCloseTo(140.3, 0)  // 236.588 * 0.593
  })
  it('converts 2 cups sugar correctly', () => {
    const { grams, ml } = convertCupToGram(2, SUGAR)
    expect(ml).toBeCloseTo(473.176, 2)
    expect(grams).toBeCloseTo(399.8, 0)  // 473.176 * 0.845
  })
  it('converts 0.5 cups', () => {
    const { ml } = convertCupToGram(0.5, FLOUR)
    expect(ml).toBeCloseTo(118.294, 2)
  })
})
```

- [ ] **Schritt 3: Tests ausführen und sicherstellen dass sie fehlschlagen**

```bash
cd frontend
npm test -- cupConversions
```

Erwartete Ausgabe: `FAIL` (Datei existiert noch nicht)

- [ ] **Schritt 4: Tests ausführen nach Erstellung der Implementierungsdatei**

```bash
cd frontend
npm test -- cupConversions
```

Erwartete Ausgabe: `17 passed`

- [ ] **Schritt 5: Commit**

```bash
git add frontend/src/lib/cupConversions.ts frontend/src/lib/cupConversions.test.ts
git commit -m "feat: add cup-to-gram conversion utilities with TDD"
```

---

## Task 4: Frontend API-Funktion und useDensities-Hook

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/useDensities.ts`

- [ ] **Schritt 1: getDensities() zu api.ts hinzufügen**

Am Ende von `frontend/src/lib/api.ts` anhängen:

```typescript
import type { DensityType } from './cupConversions'

export async function getDensities(): Promise<DensityType[]> {
  return request<DensityType[]>('/ingredient-densities')
}
```

- [ ] **Schritt 2: useDensities-Hook erstellen**

```typescript
// frontend/src/lib/useDensities.ts
import { useQuery } from '@tanstack/react-query'
import { getDensities } from './api'
import type { DensityType } from './cupConversions'

export function useDensities(): DensityType[] {
  const { data } = useQuery({
    queryKey: ['ingredient-densities'],
    queryFn: getDensities,
    staleTime: Infinity,  // Dichten ändern sich nicht zur Laufzeit
  })
  return data ?? []
}
```

- [ ] **Schritt 3: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/lib/useDensities.ts
git commit -m "feat: add getDensities API function and useDensities hook"
```

---

## Task 5: getDisplayAmount() erweitern in RecipeDetailPage

**Files:**
- Modify: `frontend/src/pages/RecipeDetailPage.tsx`

- [ ] **Schritt 1: Import der neuen Utilities hinzufügen**

In `frontend/src/pages/RecipeDetailPage.tsx` die bestehenden Imports (Zeile 1-22) um folgendes ergänzen:

```typescript
import { useDensities } from '../lib/useDensities'
import { isCupUnit, findDensityForIngredient, convertCupToGram } from '../lib/cupConversions'
```

- [ ] **Schritt 2: useDensities im Komponent aufrufen**

Direkt nach den anderen Hooks (ca. Zeile 208-210, nach `const [convertToMetric, setConvertToMetric] = useState(true)`):

```typescript
const densities = useDensities()
```

- [ ] **Schritt 3: getDisplayAmount() erweitern**

Die bestehende `getDisplayAmount`-Funktion (Zeile 500-511) ersetzen durch:

```typescript
const getDisplayAmount = (ing: Ingredient): { amount: string; unit: string | null; suffix?: string } => {
  const scaled = ing.amount != null ? ing.amount * servingsFactor : null
  if (scaled == null) return { amount: '', unit: ing.unit }

  if (convertToMetric) {
    const unitLower = ing.unit?.toLowerCase() ?? ''
    // Cup-zu-Gramm für bekannte Zutaten
    if (isCupUnit(ing.unit) && ing.name) {
      const density = findDensityForIngredient(ing.name, densities)
      if (density) {
        const { grams, ml } = convertCupToGram(scaled, density)
        return {
          amount: `~${formatAmount(grams)}g`,
          unit: null,
          suffix: `(${formatAmount(ml)}ml)`,
        }
      }
    }
    // Standard imperial → metric
    const conv = IMPERIAL_TO_METRIC[unitLower]
    if (conv) return { amount: formatAmount(scaled * conv.factor), unit: conv.unit }
  } else {
    const conv = METRIC_TO_IMPERIAL[ing.unit?.toLowerCase() ?? '']
    if (conv) return { amount: formatAmount(scaled * conv.factor), unit: conv.unit }
  }
  return { amount: formatAmount(scaled), unit: ing.unit }
}
```

- [ ] **Schritt 4: Anzeige in der Zutatenliste aktualisieren**

In der Zutatenliste (ca. Zeile 851-868) wird `getDisplayAmount` aufgerufen. Suche nach dem Rendering der `display`-Variable und stelle sicher, dass `suffix` angezeigt wird. Die Stelle sieht etwa so aus:

```tsx
{(() => {
  const display = getDisplayAmount(ing)
  return (
    <span className="text-sm font-medium text-[var(--mx-on-surface)]">
      {display.amount}
      {display.unit && ` ${display.unit}`}
      {display.suffix && <span className="text-[var(--mx-on-surface-variant)] text-xs ml-1">{display.suffix}</span>}
    </span>
  )
})()}
```

- [ ] **Schritt 5: App manuell testen**

```bash
cd frontend
npm run dev
```

Öffne ein Rezept mit Cup-Mengenangaben und Zutaten wie "Mehl" oder "Zucker". Prüfe:
- `1 cup Mehl` → `~140g (237ml)` ✓
- `1 cup Olivenöl` → `237ml` (keine Gramm, da unbekannte Zutat) ✓
- `1 tbsp` → bleibt wie bisher `15ml` ✓

- [ ] **Schritt 6: TypeScript-Fehler prüfen**

```bash
cd frontend
npx tsc --noEmit
```

Erwartete Ausgabe: keine Fehler

- [ ] **Schritt 7: Commit**

```bash
git add frontend/src/pages/RecipeDetailPage.tsx
git commit -m "feat: extend getDisplayAmount to convert cups to grams for known ingredients"
```

---

## Task 6: useDocumentTitle-Hook (TDD)

**Files:**
- Create: `frontend/src/lib/useDocumentTitle.ts`
- Create: `frontend/src/lib/useDocumentTitle.test.ts`

- [ ] **Schritt 1: Tests schreiben (failing)**

```typescript
// frontend/src/lib/useDocumentTitle.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { useDocumentTitle } from './useDocumentTitle'

function TitleComponent({ title }: { title: string }) {
  useDocumentTitle(title)
  return null
}

describe('useDocumentTitle', () => {
  afterEach(() => {
    document.title = 'Miximixi'
  })

  it('sets document.title on mount', () => {
    render(<TitleComponent title="Miximixi - Entdecken" />)
    expect(document.title).toBe('Miximixi - Entdecken')
  })

  it('updates document.title when title changes', () => {
    const { rerender } = render(<TitleComponent title="Miximixi - Entdecken" />)
    expect(document.title).toBe('Miximixi - Entdecken')
    rerender(<TitleComponent title="Miximixi - Rhabarberkuchen" />)
    expect(document.title).toBe('Miximixi - Rhabarberkuchen')
  })

  it('resets document.title to Miximixi on unmount', () => {
    const { unmount } = render(<TitleComponent title="Miximixi - Tags" />)
    unmount()
    expect(document.title).toBe('Miximixi')
  })
})
```

- [ ] **Schritt 2: Tests ausführen und sicherstellen dass sie fehlschlagen**

```bash
cd frontend
npm test -- useDocumentTitle
```

Erwartete Ausgabe: `FAIL` (Modul nicht gefunden)

- [ ] **Schritt 3: Hook implementieren**

```typescript
// frontend/src/lib/useDocumentTitle.ts
import { useEffect } from 'react'

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title
    return () => {
      document.title = 'Miximixi'
    }
  }, [title])
}
```

- [ ] **Schritt 4: Tests ausführen und sicherstellen dass sie bestehen**

```bash
cd frontend
npm test -- useDocumentTitle
```

Erwartete Ausgabe: `3 passed`

- [ ] **Schritt 5: Commit**

```bash
git add frontend/src/lib/useDocumentTitle.ts frontend/src/lib/useDocumentTitle.test.ts
git commit -m "feat: add useDocumentTitle hook with TDD"
```

---

## Task 7: Dynamische Seitentitel in allen Pages

**Files:**
- Modify: `frontend/src/pages/FeedPage.tsx`
- Modify: `frontend/src/pages/TagsPage.tsx`
- Modify: `frontend/src/pages/CookPage.tsx`
- Modify: `frontend/src/pages/RecipeDetailPage.tsx`

- [ ] **Schritt 1: FeedPage**

In `frontend/src/pages/FeedPage.tsx` den Import hinzufügen und Hook aufrufen:

```typescript
import { useDocumentTitle } from '../lib/useDocumentTitle'
```

Innerhalb der FeedPage-Komponente (vor dem return):

```typescript
useDocumentTitle('Miximixi - Entdecken')
```

- [ ] **Schritt 2: TagsPage**

In `frontend/src/pages/TagsPage.tsx`:

```typescript
import { useDocumentTitle } from '../lib/useDocumentTitle'
```

Innerhalb der Komponente:

```typescript
useDocumentTitle('Miximixi - Tags')
```

- [ ] **Schritt 3: CookPage**

In `frontend/src/pages/CookPage.tsx` zunächst prüfen wie das Rezept geladen wird (analog zu RecipeDetailPage). Dann:

```typescript
import { useDocumentTitle } from '../lib/useDocumentTitle'
```

Innerhalb der Komponente, nach dem Rezept-Fetch:

```typescript
useDocumentTitle(recipe ? `Miximixi - ${recipe.title} (Koch-Modus)` : 'Miximixi')
```

- [ ] **Schritt 4: RecipeDetailPage**

In `frontend/src/pages/RecipeDetailPage.tsx` hinzufügen (Import bereits aus Task 5 vorhanden wenn nicht, jetzt hinzufügen):

```typescript
import { useDocumentTitle } from '../lib/useDocumentTitle'
```

Innerhalb der Komponente nach dem Recipe-Query:

```typescript
useDocumentTitle(recipe ? `Miximixi - ${recipe.title}` : 'Miximixi')
```

- [ ] **Schritt 5: TypeScript-Fehler prüfen**

```bash
cd frontend
npx tsc --noEmit
```

Erwartete Ausgabe: keine Fehler

- [ ] **Schritt 6: Manuell testen**

Navigiere durch alle Seiten und prüfe den Browser-Tab-Titel:
- Feed: `Miximixi - Entdecken`
- Tags: `Miximixi - Tags`
- Rezeptdetail: `Miximixi - {Rezeptname}`
- Koch-Modus: `Miximixi - {Rezeptname} (Koch-Modus)`

- [ ] **Schritt 7: Commit**

```bash
git add frontend/src/pages/FeedPage.tsx frontend/src/pages/TagsPage.tsx \
        frontend/src/pages/CookPage.tsx frontend/src/pages/RecipeDetailPage.tsx
git commit -m "feat: add dynamic document titles to all pages"
```

---

## Task 8: Backend OG-Endpoint (TDD)

**Files:**
- Create: `backend/tests/functional/test_og_endpoint.py`
- Modify: `backend/app/main.py`

- [ ] **Schritt 1: Tests schreiben (failing)**

```python
# backend/tests/functional/test_og_endpoint.py
import pytest
from unittest.mock import MagicMock


@pytest.fixture
def mock_og_client(client, monkeypatch):
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value = mock_cursor

    def mock_get_db():
        return mock_conn

    monkeypatch.setattr("app.main.get_db", mock_get_db)
    return client, mock_cursor


class TestOgEndpoint:
    def test_valid_slug_returns_200(self, mock_og_client):
        client, mock_cursor = mock_og_client
        mock_cursor.fetchone.return_value = {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "title": "Rhabarberkuchen mit Baiser",
            "category": "Backen",
            "prep_time": "30 Minuten",
            "image_filename": "550e8400-e29b-41d4-a716-446655440000.jpg",
        }
        response = client.get("/og/recipes/rhabarberkuchen-mit-baiser-550e8400-e29b-41d4-a716-446655440000")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/html")

    def test_og_title_in_response(self, mock_og_client):
        client, mock_cursor = mock_og_client
        mock_cursor.fetchone.return_value = {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "title": "Rhabarberkuchen mit Baiser",
            "category": "Backen",
            "prep_time": "30 Minuten",
            "image_filename": "550e8400-e29b-41d4-a716-446655440000.jpg",
        }
        response = client.get("/og/recipes/rhabarberkuchen-550e8400-e29b-41d4-a716-446655440000")
        assert "Rhabarberkuchen mit Baiser" in response.text
        assert 'property="og:title"' in response.text

    def test_og_image_url_in_response(self, mock_og_client):
        client, mock_cursor = mock_og_client
        mock_cursor.fetchone.return_value = {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "title": "Testkuchen",
            "category": "Backen",
            "prep_time": None,
            "image_filename": "cover.jpg",
        }
        response = client.get("/og/recipes/testkuchen-550e8400-e29b-41d4-a716-446655440000")
        assert "/images/550e8400-e29b-41d4-a716-446655440000" in response.text
        assert 'property="og:image"' in response.text

    def test_redirect_meta_tag_in_response(self, mock_og_client):
        client, mock_cursor = mock_og_client
        mock_cursor.fetchone.return_value = {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "title": "Testkuchen",
            "category": None,
            "prep_time": None,
            "image_filename": None,
        }
        response = client.get("/og/recipes/testkuchen-550e8400-e29b-41d4-a716-446655440000")
        assert "http-equiv=\"refresh\"" in response.text

    def test_invalid_slug_returns_404(self, mock_og_client):
        client, mock_cursor = mock_og_client
        mock_cursor.fetchone.return_value = None
        response = client.get("/og/recipes/nicht-vorhanden-00000000-0000-0000-0000-000000000000")
        assert response.status_code == 404
```

- [ ] **Schritt 2: Tests ausführen und sicherstellen dass sie fehlschlagen**

```bash
cd backend
poetry run pytest tests/functional/test_og_endpoint.py -v
```

Erwartete Ausgabe: `FAILED` (Endpoint existiert nicht)

- [ ] **Schritt 3: Endpoint in main.py implementieren**

Imports oben in `main.py` ergänzen (falls nicht vorhanden):

```python
from fastapi.responses import HTMLResponse
```

Dann vor den `/recipes`-Endpoints den neuen Endpoint einfügen:

```python
@app.get("/og/recipes/{recipe_slug}", response_class=HTMLResponse)
async def get_og_recipe(recipe_slug: str):
    """Liefert OG-Meta-Tags für Messenger-Link-Previews."""
    db = get_db()
    cursor = db.cursor(cursor_factory=RealDictCursor)
    try:
        if len(recipe_slug) > 36 and recipe_slug[-37] == '-':
            recipe_id = recipe_slug[-36:]
        else:
            recipe_id = recipe_slug

        cursor.execute(
            "SELECT id, title, category, prep_time, image_filename FROM recipes WHERE id = %s",
            (recipe_id,),
        )
        recipe = cursor.fetchone()

        if not recipe:
            raise HTTPException(status_code=404, detail="Rezept nicht gefunden")

        frontend_url = os.environ.get("FRONTEND_URL", "https://miximixi.sektbirne.fun")
        recipe_url = f"{frontend_url}/recipes/{recipe_slug}"
        image_url = f"{frontend_url}/images/{recipe['id']}" if recipe.get("image_filename") else ""

        description_parts = []
        if recipe.get("category"):
            description_parts.append(recipe["category"])
        if recipe.get("prep_time"):
            description_parts.append(f"Zubereitungszeit: {recipe['prep_time']}")
        description = " · ".join(description_parts) if description_parts else "Rezept auf Miximixi"

        html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>{recipe['title']}</title>
  <meta property="og:title" content="{recipe['title']}" />
  <meta property="og:description" content="{description}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="{recipe_url}" />
  {f'<meta property="og:image" content="{image_url}" />' if image_url else ''}
  <meta http-equiv="refresh" content="0;url={recipe_url}" />
</head>
<body>
  <p>Weiterleitung zu <a href="{recipe_url}">{recipe['title']}</a>...</p>
</body>
</html>"""
        return HTMLResponse(content=html)
    finally:
        cursor.close()
        db.close()
```

- [ ] **Schritt 4: Tests ausführen und sicherstellen dass sie bestehen**

```bash
cd backend
poetry run pytest tests/functional/test_og_endpoint.py -v
```

Erwartete Ausgabe: `5 passed`

- [ ] **Schritt 5: Commit**

```bash
git add backend/app/main.py backend/tests/functional/test_og_endpoint.py
git commit -m "feat: add GET /og/recipes/{slug} endpoint for messenger link previews"
```

---

## Task 9: Nginx Bot-Routing für Open Graph

**Files:**
- Modify: `frontend/nginx.conf`

- [ ] **Schritt 1: nginx.conf aktualisieren**

Den bestehenden Inhalt von `frontend/nginx.conf` ersetzen durch:

```nginx
map $http_user_agent $is_bot {
    default                 0;
    ~*TelegramBot           1;
    ~*WhatsApp              1;
    ~*Slackbot              1;
    ~*Discordbot            1;
    ~*Twitterbot            1;
    ~*facebookexternalhit   1;
    ~*LinkedInBot           1;
    ~*iMessageBot           1;
}

server {
    listen 2000;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # Serve static assets with caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # Bot-Routing für Rezeptseiten: Bots bekommen OG-HTML vom Backend
    location /recipes/ {
        if ($is_bot) {
            proxy_pass http://backend:8000/og$request_uri;
        }
        try_files $uri /index.html;
    }

    # SPA fallback: route everything to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Schritt 2: Manuell testen mit curl**

Starte die App lokal (`docker compose up -d`) und teste:

```bash
# Echter User → React HTML
curl -s http://localhost:2000/recipes/testkuchen-{uuid} | grep "<title>"
# Erwartete Ausgabe: <title>Miximixi</title>

# Telegram-Bot → OG-HTML
curl -s -A "TelegramBot/1.0" http://localhost:2000/recipes/testkuchen-{uuid} | grep "og:title"
# Erwartete Ausgabe: <meta property="og:title" content="..." />
```

- [ ] **Schritt 3: Commit**

```bash
git add frontend/nginx.conf
git commit -m "feat: add bot user-agent routing in nginx for OG meta tags"
```

---

## Task 10: Alle Tests ausführen und Gesamtcheck

- [ ] **Schritt 1: Backend-Tests**

```bash
cd backend
poetry run pytest tests/ -v
```

Erwartete Ausgabe: alle Tests grün, keine Fehler

- [ ] **Schritt 2: Frontend-Tests**

```bash
cd frontend
npm test
```

Erwartete Ausgabe: alle Tests grün, keine Fehler

- [ ] **Schritt 3: TypeScript-Check**

```bash
cd frontend
npx tsc --noEmit
```

Erwartete Ausgabe: keine Fehler

- [ ] **Schritt 4: Frontend-Build**

```bash
cd frontend
npm run build
```

Erwartete Ausgabe: erfolgreich, keine Warnungen

- [ ] **Schritt 5: Abschluss-Commit**

```bash
git commit --allow-empty -m "chore: all features complete - cup conversion, dynamic titles, OG tags"
```
