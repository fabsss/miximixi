# Design: Cup-Konvertierung, Dynamischer Seitentitel, Open Graph Tags

**Datum:** 2026-04-24  
**Status:** Approved

---

## Implementierungsansatz: Test-Driven Development (TDD)

**Alle drei Features müssen im TDD-Stil implementiert werden:**

1. Zuerst Tests schreiben (failing)
2. Minimale Implementierung, die die Tests zum Bestehen bringt
3. Refactoring unter grünen Tests

Für das Backend bedeutet das: pytest-Tests vor jedem neuen Endpoint oder jeder neuen Datenbanklogik. Für das Frontend: Unit-Tests für die Konvertierungslogik (Vitest) vor der Implementierung der Umrechnungsfunktionen. Integrationstests für das Nginx-Routing sind optional, aber die Backend-OG-Endpoint-Tests sind Pflicht.

---

## Feature 1: Cup-Konvertierung in Gramm

### Problem

Die aktuelle Konvertierung in [`RecipeDetailPage.tsx`](../../../frontend/src/pages/RecipeDetailPage.tsx) rechnet `cup/cups/tasse/tassen` immer in `ml` um. In Europa werden viele Zutaten (Mehl, Zucker, Butter etc.) gewogen, nicht in Volumen gemessen. Eine reine ml-Angabe ist für diese Zutaten unpraktisch.

### Lösung

Für bestimmte Zutaten wird cups in **Gramm** umgerechnet (Primäreinheit), mit dem **exakten Volumen in Klammern** als Sekundärinfo. Das Gewicht wird mit `~` markiert, da es durch die Dichte approximiert ist. Das Volumen ist exakt.

**Beispiel:** `2 cups Mehl` → `~283g (473ml)`

### Datenmodell (Backend)

Zwei neue Tabellen per Migration:

```sql
CREATE TABLE ingredient_density_types (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_name   TEXT NOT NULL UNIQUE,       -- z.B. 'flour', 'sugar', 'butter'
    display_name TEXT,                      -- z.B. 'Mehl / Flour'
    density_g_per_ml NUMERIC NOT NULL       -- Dichte in g/ml
);

CREATE TABLE ingredient_density_keywords (
    id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_id  UUID NOT NULL REFERENCES ingredient_density_types(id) ON DELETE CASCADE,
    keyword  TEXT NOT NULL UNIQUE           -- z.B. 'mehl', 'flour', 'weizenmehl'
);
```

### Initiale Daten (per Migration/Seed)

| type_name | density_g/ml | Keywords |
|-----------|-------------|----------|
| `flour` | 0.593 | mehl, weizenmehl, flour, all-purpose flour, dinkelmehl, spelt flour, roggenmehl, backpulver, baking powder, stärke, cornstarch, speisestärke |
| `sugar` | 0.845 | zucker, sugar, kristallzucker, granulated sugar, brauner zucker, brown sugar |
| `powdered_sugar` | 0.560 | puderzucker, powdered sugar, icing sugar, confectioners sugar |
| `butter` | 0.911 | butter, margarine |
| `breadcrumbs` | 0.370 | semmelbröseln, semmelbrösel, breadcrumbs, paniermehl |
| `oats` | 0.340 | haferflocken, oats, rolled oats |
| `cocoa` | 0.520 | kakao, cocoa, cocoa powder, kakaopulver |
| `rice` | 0.780 | reis, rice |
| `salt` | 1.217 | salz, salt |

### Backend API

```
GET /ingredient-densities
```

Response:
```json
[
  {
    "type_name": "flour",
    "display_name": "Mehl / Flour",
    "density_g_per_ml": 0.593,
    "keywords": ["mehl", "weizenmehl", "flour", ...]
  },
  ...
]
```

Kein Schreib-Endpoint. Daten nur per Migration verwaltbar.

### Frontend-Logik

1. `useDensities()` React-Query-Hook ruft `/ingredient-densities` einmalig ab und cached das Ergebnis.
2. Neue Hilfsfunktion `findDensityForIngredient(name: string, densities)` — case-insensitive Substring-Match auf alle Keywords.
3. `getDisplayAmount()` wird erweitert:
   - Wenn Einheit `cup/cups/tasse/tassen` UND Density gefunden:
     - Volumen: `amount * 236.588` ml (exakt)
     - Gewicht: `volumen_ml * density_g_per_ml` g (approximiert)
     - Anzeige: `~{gewicht}g ({volumen}ml)`
   - Sonst: bestehende Logik (→ ml) bleibt unverändert

### TDD-Anforderungen

- **Backend:** pytest-Tests für GET `/ingredient-densities` (leere DB, befüllte DB, Response-Schema)
- **Frontend:** Vitest-Unit-Tests für `findDensityForIngredient()` und die erweiterte `getDisplayAmount()`-Logik (bekannte Keywords, unbekannte Zutaten, case-insensitivity, Randwerte)

---

## Feature 2: Dynamischer Seitentitel

### Problem

`index.html` hat einen statischen `<title>Miximixi</title>`. Alle Seiten zeigen denselben Titel im Browser-Tab.

### Lösung

Neuer Hook `useDocumentTitle(title: string)` in `src/lib/useDocumentTitle.ts`:

```typescript
import { useEffect } from 'react'

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title
    return () => { document.title = 'Miximixi' }
  }, [title])
}
```

Jede Page-Komponente ruft den Hook auf:

| Seite | Titel |
|-------|-------|
| FeedPage | `Miximixi - Entdecken` |
| TagsPage | `Miximixi - Tags` |
| RecipeDetailPage | `Miximixi - {recipe.title}` (während Loading: `Miximixi`) |
| CookPage | `Miximixi - {recipe.title} (Koch-Modus)` |

Kein zusätzliches Library (kein react-helmet), da kein SSR im Einsatz ist.

### TDD-Anforderungen

- **Frontend:** Vitest-Tests für `useDocumentTitle()` — prüft ob `document.title` korrekt gesetzt und beim Unmount zurückgesetzt wird.
- Tests für RecipeDetailPage prüfen den Titel nach dem Laden des Rezepts.

---

## Feature 3: Open Graph Meta-Tags für Messenger-Previews

### Problem

Miximixi ist eine React SPA. Messenger-Bots (Telegram, WhatsApp, Slack, Discord etc.) führen kein JavaScript aus und sehen nur den leeren HTML-Shell ohne OG-Tags → keine Link-Previews.

### Lösung

**User-Agent-basiertes Routing im Frontend-Nginx-Container:**

Bekannte Bot-User-Agents bei Requests auf `/recipes/*` werden intern ans FastAPI-Backend weitergeleitet. Echte User erhalten wie gewohnt den React-HTML-Shell.

```nginx
map $http_user_agent $is_bot {
    default           0;
    ~*TelegramBot     1;
    ~*WhatsApp        1;
    ~*Slackbot        1;
    ~*Discordbot      1;
    ~*Twitterbot      1;
    ~*facebookexternalhit 1;
    ~*LinkedInBot     1;
    ~*iMessageBot     1;
}

location /recipes/ {
    if ($is_bot) {
        proxy_pass http://backend:8000/og$request_uri;
    }
    try_files $uri /index.html;
}
```

**Neuer FastAPI-Endpoint:**

```
GET /og/recipes/{slug}
```

- Liest Rezept aus DB (Titel, Kategorie, image_filename, prep_time)
- Gibt minimales HTML zurück mit:
  - `og:title` → Rezeptname
  - `og:description` → Kategorie + Prep-Time (falls vorhanden)
  - `og:image` → `https://miximixi.sektbirne.fun/images/{recipe_id}`
  - `og:url` → `https://miximixi.sektbirne.fun/recipes/{slug}`
  - `og:type` → `"article"`
  - `<meta http-equiv="refresh" content="0;url=/recipes/{slug}">` als Fallback für direkte Browser-Aufrufe

**Worst-Case-Analyse:**
- Bot als User erkannt → Bot bekommt React-Shell ohne OG-Tags → keine Preview, kein Schaden
- User als Bot erkannt → User bekommt Mini-HTML mit sofortigem Redirect → kaum merkbare Verzögerung

### TDD-Anforderungen

- **Backend:** pytest-Tests für `GET /og/recipes/{slug}`:
  - Gültiger Slug → 200 mit korrekten OG-Tags im HTML
  - Ungültiger Slug → 404
  - OG-Image-URL korrekt gebildet
  - Redirect-Meta-Tag vorhanden
- Nginx-Routing wird manuell mit curl + User-Agent-Header getestet (dokumentiert in testing-guide).

---

## Änderungsübersicht

| Bereich | Dateien |
|---------|---------|
| Backend Migration | `migrations/00X_ingredient_densities.sql` |
| Backend Endpoint | `backend/app/main.py` (GET /ingredient-densities, GET /og/recipes/{slug}) |
| Backend Tests | `backend/tests/test_ingredient_densities.py`, `backend/tests/test_og_endpoint.py` |
| Frontend Hook | `frontend/src/lib/useDocumentTitle.ts` |
| Frontend Hook | `frontend/src/lib/useDensities.ts` |
| Frontend Utils | `frontend/src/lib/cupConversions.ts` (findDensityForIngredient) |
| Frontend Page | `frontend/src/pages/RecipeDetailPage.tsx` (getDisplayAmount erweitert, useDensities, useDocumentTitle) |
| Frontend Page | `frontend/src/pages/FeedPage.tsx` (useDocumentTitle) |
| Frontend Page | `frontend/src/pages/TagsPage.tsx` (useDocumentTitle) |
| Frontend Page | `frontend/src/pages/CookPage.tsx` (useDocumentTitle) |
| Frontend Tests | `frontend/src/lib/cupConversions.test.ts`, `frontend/src/lib/useDocumentTitle.test.ts` |
| Nginx Config | `frontend/nginx.conf` (Bot-Routing für /recipes/) |
