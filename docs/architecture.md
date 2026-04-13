# Miximixi – Architektur & Tech Stack

## Übersicht

```
┌─────────────────────────────────────────────────────┐
│                   Frontend (React PWA)               │
│              Vite + Tailwind + Supabase JS           │
└───────────────────────┬─────────────────────────────┘
                        │ HTTP / Supabase Realtime
┌───────────────────────▼─────────────────────────────┐
│              Supabase (self-hosted)                   │
│     PostgreSQL + Auth + Storage + PostgREST + RLS    │
└───────────────────────┬─────────────────────────────┘
                        │ import_queue polling
┌───────────────────────▼─────────────────────────────┐
│                FastAPI Backend                        │
│      LLM Abstraction + Queue Worker + ffmpeg         │
└──────┬─────────────────────┬───────────────────────-─┘
       │                     │
┌──────▼──────┐    ┌─────────▼──────────┐
│   Ollama    │    │  Gemini/Claude/    │
│ llama3.2-   │    │  OpenAI API        │
│ vision:11b  │    └────────────────────┘
└─────────────┘
┌─────────────────────────────────────────────────────┐
│                    n8n (self-hosted)                  │
│    Telegram Trigger → yt-dlp → Backend /import       │
│    Schedule → instagrapi → Backend /import           │
└─────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Schicht | Tool | Version | Begründung |
|---------|------|---------|-----------|
| Frontend | React + TypeScript | 18+ | PWA-fähig, später zu React Native migrierbar |
| Build | Vite + vite-plugin-pwa | 5+ | Schnell, PWA out-of-the-box |
| Styling | Tailwind CSS | 3+ | Stitch-Tokens direkt in Config |
| Icons | Material Symbols Outlined | – | Stitch-Vorgabe |
| Backend | FastAPI + Python | 3.12+ | Async, einfach, schnell |
| Dependency Mgmt | Poetry | – | Lockfile, sauber |
| DB + Auth + Storage | Supabase (self-hosted) | – | PostgreSQL + RLS + Storage in einem |
| Workflow | n8n (self-hosted) | – | Import-Pipelines ohne Code-Boilerplate |
| LLM (lokal) | Ollama + llama3.2-vision:11b | – | Kein GPU nötig, CPU-only, langsam |
| LLM (Cloud) | Google Gemini | gemini-2.0-flash | Native Video-Analyse, 1 API-Call für Rezept + Foto |
| LLM (Alt.) | Claude API | claude-sonnet-4-6 | Alternative Cloud-Option |
| Video | ffmpeg | – | Keyframe-Extraktion (nur für Ollama/Claude/OpenAI) |
| Web-Scraping | Playwright | – | Screenshot + HTML für Website-Import |
| Instagram Download | yt-dlp | – | Kein Login nötig (Instagram, YouTube, öffentliche Posts) |
| Instagram Sync | instagrapi | – | Saved Collections (inoffiziell, Zweit-Account) |
| Reverse Proxy | Zoraxy | – | Bereits im Homelab vorhanden |
| Deployment | Docker Compose | – | Alle Services in einem Stack |

---

## Unterstützte Quellen

| Quelle | Import-Weg | Medien | Caption / Text |
|--------|-----------|--------|----------------|
| Instagram (Link) | Telegram Bot + yt-dlp | Video oder Bild | Instagram Caption |
| Instagram (Collection) | n8n Poller + instagrapi | Video oder Bild | Instagram Caption |
| YouTube | Telegram Bot + yt-dlp | Video | YouTube-Beschreibung |
| Website (Rezept-Blog etc.) | Telegram Bot + Playwright | Screenshot | HTML-Text (bereinigt) |

---

## Datenbank-Schema

```sql
-- Supabase verwaltet auth.users

CREATE TABLE recipes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Kernrezept-Daten (aus LLM-Extraktion)
  title             TEXT NOT NULL,
  lang              TEXT DEFAULT 'de',
  category          TEXT,
  servings          INT,
  prep_time         TEXT,
  cook_time         TEXT,
  tags              TEXT[],

  -- Bild (optional – NULL wenn nicht extrahierbar)
  image_url         TEXT,              -- Supabase Storage URL

  -- Quell-Informationen
  source_url        TEXT NOT NULL,
  source_type       TEXT,              -- 'instagram' | 'youtube' | 'web' | 'telegram'
  source_label      TEXT,             -- z.B. "@username" oder "recipeblog.com"

  -- Fallback: Rohtext aus Caption / YouTube-Beschreibung / HTML
  -- Wird immer gespeichert, um bei LLM-Fehlern manuell nachextrahieren zu können
  raw_source_text   TEXT,

  -- Nutzer-Daten
  rating            SMALLINT,          -- NULL=unbewertet, 1=gut, -1=schlecht
  notes             TEXT,

  -- Metadaten
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  created_by        UUID REFERENCES auth.users(id),

  -- Extraktion-Tracking
  llm_provider_used TEXT,              -- 'gemini' | 'claude' | 'ollama' | etc.
  extraction_status TEXT DEFAULT 'success'
                    -- 'success' | 'partial' (kein Foto) | 'needs_review' (Fehler)
);

CREATE TABLE ingredients (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id  UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  name       TEXT NOT NULL,
  amount     NUMERIC,
  unit       TEXT
);

CREATE TABLE steps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id    UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  sort_order   INT NOT NULL DEFAULT 0,
  text         TEXT NOT NULL,          -- enthält {ingredient_id} Referenzen
  time_minutes INT
);

CREATE TABLE import_queue (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url        TEXT NOT NULL,
  source_type       TEXT,              -- 'instagram' | 'youtube' | 'web' | 'telegram'
  status            TEXT DEFAULT 'pending',  -- pending | processing | done | error | needs_review
  recipe_id         UUID REFERENCES recipes(id),
  error_msg         TEXT,
  llm_provider_used TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE translations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id   UUID REFERENCES recipes(id) ON DELETE CASCADE,
  lang        TEXT NOT NULL DEFAULT 'de',
  title       TEXT,
  ingredients JSONB,
  steps       JSONB,
  is_stale    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (recipe_id, lang)
);
```

### RLS-Policy
```sql
-- Alle authentifizierten User lesen + schreiben alles
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON recipes FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- analog für ingredients, steps, import_queue, translations
```

---

## LLM Abstraction Layer

```python
# backend/app/llm_provider.py
class LLMProvider:
    def extract_recipe(self, media_paths: list[str], caption: str) -> ExtractedRecipe:
        match settings.llm_provider:
            case "gemini":        return self._gemini_extract(media_paths, caption)
            case "claude":        return self._claude_extract(media_paths, caption)
            case "openai":        return self._openai_extract(media_paths, caption)
            case "openai_compat": return self._openai_compat_extract(media_paths, caption)
            case _:               return self._ollama_extract(media_paths, caption)
```

### Gemini: 1 API-Call für Rezept + Foto

Gemini ist der einzige Provider, der Videos nativ verarbeiten kann **und** gleichzeitig ein Bild extrahieren kann. Alles in einem einzigen API-Call:

| Provider | Video-Input | Foto-Extraktion | ffmpeg nötig? |
|----------|------------|-----------------|--------------|
| **Gemini** | Video direkt (Files API) | Gemini wählt + gibt Base64 zurück | ❌ Nein |
| Ollama | — (kein Video-Support) | ffmpeg → 5 Frames → LLM wählt besten | ✅ Ja |
| Claude | — (kein Video-Support) | ffmpeg → 5 Frames → LLM wählt besten | ✅ Ja |
| OpenAI | — (kein Video-Support) | ffmpeg → 5 Frames → LLM wählt besten | ✅ Ja |

**Gemini Extraktion (1 API-Call):**
```
Input:
  ├── Video (nativ via Files API) oder Screenshot
  └── Caption / YouTube-Beschreibung / HTML-Text (als Kontext)

Anforderungen im Prompt:
  1. Extrahiere Rezept als JSON (Titel, Zutaten, Schritte)
  2. Extrahiere das appetitlichste Foto vom fertigen Gericht (Base64)

Output:
  └── { recipe_json, image_base64 }
```

**Caption / Text als Kontext:**
- Caption/HTML wird immer als Zusatz-Kontext an den LLM-Call übergeben
- Gemini kombiniert Video-Analyse + Textinformationen intelligent
- Ermöglicht bessere Extraktion wenn Caption bereits vollständige Rezeptdaten enthält
- Raw-Text wird **immer in `raw_source_text` gespeichert** (unabhängig vom Ergebnis)

### LLM Extraktion Output (JSON)

```json
{
  "title": "Pasta al Limone",
  "lang": "it",
  "category": "Pasta",
  "servings": 2,
  "prep_time": "10 min",
  "cook_time": "15 min",
  "tags": ["vegetarisch", "schnell"],
  "ingredients": [
    { "id": 1, "name": "Spaghetti", "amount": 200, "unit": "g" }
  ],
  "steps": [
    { "id": 1, "text": "Salzwasser kochen. {1} al dente kochen.", "time_minutes": 12 }
  ]
}
```

**Wichtig:** `{ingredient_id}` in Steps ermöglicht Live-Highlighting + Unit-Conversion im Frontend.

---

## Import-Flow (Telegram / YouTube / Website)

```
User → Telegram Bot (Instagram-Link | YouTube-Link | Website-URL)
  → n8n Telegram-Trigger
    → URL extrahieren + source_type bestimmen
    → Backend POST /import { url, source_type }
      → import_queue eintragen (status: pending)
      → Telegram-Antwort: "✅ Wird verarbeitet..."
    → Queue-Worker (polling alle 5s):

      ── Medien herunterladen ──────────────────────────────────
      ├─ instagram / youtube: yt-dlp → Video (MP4) + Caption/Beschreibung
      └─ web: Playwright → Screenshot (PNG) + HTML-Text bereinigt

      ── LLM-Extraktion ────────────────────────────────────────
      ├─ [Gemini-Pfad]
      │    → Video/Screenshot + raw_source_text an Gemini (1 API-Call)
      │    → Output: { recipe_json, image_base64 }
      │    → image_base64 → Supabase Storage
      │
      └─ [Anderer-Pfad: Ollama / Claude / OpenAI]
           → ffmpeg: Video → 5 Keyframes
           → LLM: Frames + raw_source_text → { recipe_json, best_frame_index }
           → ffmpeg: Frame extrahieren → Base64 → Supabase Storage

      ── Fehlerbehandlung ──────────────────────────────────────
      ├─ Rezept ok, kein Foto:
      │    → image_url = NULL, extraction_status = 'partial'
      ├─ LLM-Fehler → Fallback raw_source_text parsen:
      │    → extraction_status = 'partial'
      └─ Alle Fallbacks fehlgeschlagen:
           → extraction_status = 'needs_review'
           → Telegram: "⚠️ @fabian: Rezept konnte nicht extrahiert werden: [Link]"
           → App zeigt manuellen Editor

      ── Speichern ─────────────────────────────────────────────
      → recipes + ingredients + steps einfügen
      → raw_source_text speichern (immer)
      → llm_provider_used + extraction_status setzen
      → import_queue status: done
```

## Import-Flow (Instagram Collection Poller)

```
n8n Schedule (alle 15 Min)
  → Backend GET /instagram/sync
    → instagrapi: Collection Items abrufen
    → Duplikat-Check via source_url
    → Neue Items → import_queue (pending)
    → Queue-Worker verarbeitet (wie oben)
```

---

## Supabase Storage

```
supabase-storage/
└── recipe-images/
    ├── {recipe_id}.jpg     # Titelbild (dauerhaft)
    └── tmp/                # Temporär (nach Verarbeitung gelöscht)
```

Bilder nur für authentifizierte User zugänglich (Storage RLS).

---

## ENV-Variablen

Vollständige Liste → `.env.example`

| Variable | Beispiel | Beschreibung |
|----------|---------|-------------|
| `LLM_PROVIDER` | `gemini` | `gemini` / `ollama` / `claude` / `openai` / `openai_compat` |
| `GEMINI_API_KEY` | `AIza...` | – |
| `GEMINI_MODEL` | `gemini-2.0-flash` | – |
| `OLLAMA_BASE_URL` | `http://ollama:11434` | – |
| `OLLAMA_MODEL` | `llama3.2-vision:11b` | – |
| `CLAUDE_API_KEY` | `sk-ant-...` | – |
| `CLAUDE_MODEL` | `claude-sonnet-4-6` | – |
| `SUPABASE_URL` | `http://supabase-api:8000` | – |
| `SUPABASE_ANON_KEY` | – | Aus Supabase Studio |
| `SUPABASE_SERVICE_KEY` | – | Für Backend (RLS bypass) |
| `TELEGRAM_BOT_TOKEN` | – | Von @BotFather |
| `INSTAGRAM_USERNAME` | `fabian.rezepte` | Zweit-Account! |
| `INSTAGRAM_PASSWORD` | – | – |
| `INSTAGRAM_COLLECTION_ID` | – | ID der Saved Collection |
