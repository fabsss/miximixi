# Rezepte-App – Übergabedokument für Claude Code

## Projektziel
Private Rezepte-App für 2 Nutzer (Fabian + Freundin). Rezepte werden automatisch aus Instagram Collections und per Telegram-Bot importiert, per KI extrahiert und strukturiert gespeichert. Die App läuft self-hosted auf einem Homeserver (kein GPU).

---

## Tech Stack (entschieden)

| Schicht | Tool | Begründung |
|---|---|---|
| Frontend | React (PWA) | Später zu React Native/Expo migrierbar (~70% Code-Sharing) |
| Backend/Orchestrierung | n8n (self-hosted) | Import-Pipelines ohne Boilerplate-Code |
| Datenbank + Auth + Storage | Supabase (self-hosted) | PostgreSQL + Row-Level-Security + Storage-Buckets |
| LLM Extraktion | Ollama (primär) / Claude API (Fallback) | Kein GPU auf Homeserver, Abstraction Layer per ENV-Variable |
| LLM Modell | llama3.2-vision:11b (Q4) | Einziges kleines Modell mit nativem Vision-Support |
| Deployment | Docker Compose | Homeserver, alle Services in einem Stack |

---

## Deployment-Ziel
- Self-hosted Homeserver, **kein GPU**
- Alle Services via `docker-compose.yml`
- Domain/Reverse Proxy: Nginx oder Traefik (noch offen)
- Kein Cloud-Deployment geplant

---

## Import-Wege (2 Stück)

### Weg 1: Instagram Collection Poller
- n8n Schedule-Node (alle 15 Min)
- Scannt eine konfigurierbare Instagram Saved Collection
- Neue Items → Download → LLM-Extraktions-Queue
- Bibliothek: `instagrapi` (Python, inoffiziell) oder Instagram Basic Display API

### Weg 2: Telegram Bot
- n8n Telegram-Trigger-Node
- Fabian oder Freundin schickt Instagram-Link an den Bot
- Bot lädt Medien herunter, pusht in Queue
- Sofortiger Status-Feedback im Chat: "✅ Rezept wird verarbeitet…"

---

## LLM-Extraktion Pipeline

### Input-Quellen (beide müssen unterstützt werden)
1. **Caption** – Text direkt aus dem Instagram-Post
2. **Video** – ffmpeg extrahiert Keyframes → Vision-LLM liest eingeblendete Texte/Zutatenlisten

### Titelbild-Extraktion
- ffmpeg extrahiert mehrere Frames aus dem Video
- LLM wählt den "appetitlichsten" Frame (oder Heuristik: mittlerer Frame)
- Gespeichert in Supabase Storage

### LLM Abstraction Layer
Wählbar per `LLM_PROVIDER` ENV-Variable. Unterstützte Provider:

| Provider | ENV-Wert | Modell (Beispiel) | Anmerkung |
|---|---|---|---|
| Ollama (lokal) | `ollama` | `llama3.2-vision:11b` | Default, kein GPU nötig, langsam |
| Claude API | `claude` | `claude-opus-4-5` | Beste Qualität, kostenpflichtig |
| OpenAI API | `openai` | `gpt-4o` | Alternative Cloud-Option |
| OpenAI-kompatibler Endpoint | `openai_compat` | beliebig | Für andere Cloud-Anbieter (Groq, Together, etc.) |

```python
# llm_provider.py – wählbar per ENV-Variable

class LLMProvider:
    def extract_recipe(self, image_url: str, text: str) -> Recipe:
        match settings.LLM_PROVIDER:
            case "claude":
                return self._claude_extract(image_url, text)
            case "openai":
                return self._openai_extract(image_url, text)
            case "openai_compat":
                return self._openai_compat_extract(image_url, text)
            case _:  # "ollama" default
                return self._ollama_extract(image_url, text)
```

Alle Provider implementieren dasselbe Interface – das Frontend und die n8n-Workflows müssen bei einem Provider-Wechsel nicht angepasst werden.

### Extraktions-Output (JSON)
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

**Wichtig:** Zutaten-Referenzen in Schritten als `{ingredient_id}` – ermöglicht Live-Highlighting und Unit-Conversion in der App.

## Instagram-Zugriff

Die offizielle Instagram Basic Display API unterstützt keine Saved Collections und scheidet daher aus. Folgende Strategie wird verwendet:

### Weg 1: Collection Poller via `instagrapi`
- Benötigt Instagram-Credentials eines **dedizierten Zweit-Accounts** (z.B. `fabian.rezepte`) – nicht den Haupt-Account, um Sperr-Risiken zu minimieren
- `instagrapi` simuliert einen echten Instagram-Client (inoffiziell, verstößt gegen Instagram ToS, für private Nutzung in der Praxis stabil)
- Credentials werden als ENV-Variablen hinterlegt, nie im Code
- Bei Captcha-Challenges: manueller Login einmalig nötig, Session wird gecacht
- Risiko-Mitigation: polling interval ≥ 15 Min, kein massenhafter Zugriff

### Weg 2: Telegram Bot via `yt-dlp` (primär empfohlen)
- **Kein Instagram-Login nötig** – n8n empfängt nur den geteilten Link
- `yt-dlp` lädt Video/Bild über den öffentlichen Instagram-Link herunter
- Robuster und ToS-konformer als Option 1
- Flow: Instagram-Post teilen → "Link kopieren" → an Telegram Bot schicken → n8n verarbeitet

**Entscheidung:** Beide Wege werden implementiert. Dafür wird ein dedizierter Instagram-Zweit-Account angelegt (nicht der Haupt-Account). Weg 2 (Telegram + yt-dlp) ist der primäre Import-Weg. Weg 1 (Collection Poller) läuft parallel als automatischer Hintergrund-Sync.

---

 (Supabase / PostgreSQL)

```sql
-- Nutzer (Supabase Auth)
-- auth.users wird von Supabase verwaltet

CREATE TABLE recipes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  lang        TEXT DEFAULT 'de',         -- Originalsprache
  category    TEXT,
  servings    INT,
  prep_time   TEXT,
  cook_time   TEXT,
  tags        TEXT[],
  image_url   TEXT,                      -- Supabase Storage URL
  source_url  TEXT,                      -- Original Instagram / Web URL
  source_label TEXT,                     -- z.B. "@username"
  rating      SMALLINT,                  -- NULL=unbewertet, 1=gut, -1=schlecht
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id)
);

CREATE TABLE ingredients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id   UUID REFERENCES recipes(id) ON DELETE CASCADE,
  sort_order  INT,
  name        TEXT NOT NULL,
  amount      NUMERIC,
  unit        TEXT
);

CREATE TABLE steps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id   UUID REFERENCES recipes(id) ON DELETE CASCADE,
  sort_order  INT,
  text        TEXT NOT NULL,             -- enthält {ingredient_id} Referenzen
  time_minutes INT
);

CREATE TABLE import_queue (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url  TEXT NOT NULL,
  source_type TEXT,                      -- 'instagram', 'telegram', 'web'
  status      TEXT DEFAULT 'pending',    -- pending | processing | done | error
  error_msg   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

### Row-Level-Security
- Beide Nutzer (Fabian + Freundin) haben Zugriff auf alle Rezepte (shared collection)
- Einfachste Lösung: RLS-Policy die alle authentifizierten User lesen/schreiben lässt
- Später erweiterbar auf Teams/Gruppen

---

## Frontend – Feature-Übersicht (Phase 1 abgeschlossen)

Alle folgenden Features sind im React-Prototyp bereits implementiert und getestet:

- **Rezeptliste** mit Kategorie-Filter, Titelbild, Tags, Bewertungs-Icon
- **Detailansicht**
  - Tablet-Layout: Zutaten links / Schritte rechts
  - Mobile: gestapelt
  - Mengen-Highlighting in Schritten (toggle)
  - Timer pro Schritt
  - Klickbarer Quell-Link
- **Einheiten-Umrechnung** (1 Button: alles → Metrisch)
  - `cup → ml`, `oz/lb → g`, `tsp → TL (~Xg)`, `tbsp → EL (~Xg)`
- **Portionen anpassen** – Touch-freundliches Bottom-Sheet mit +/− und Slider
- **Koch-Modus** – Vollbild dunkel, Step-by-Step, Fortschrittsbalken, Timer
- **Bewertung** – Swipe-Karten (Left/Right) für unbewertete Rezepte
- **Notizen** – editierbar pro Rezept
- **Übersetzung** – per Claude API, gecacht, Originalsprache bleibt in DB
- **Rezept-Editor** – Titel, Zutaten (Name/Menge/Einheit), Schritte (Text, Reihenfolge) editierbar
- **Dark Mode** – Toggle oben rechts

## Bild-Speicherung (Supabase Storage)

Supabase Storage ist ein S3-kompatibler Objekt-Store der im self-hosted Supabase-Stack enthalten ist. Dateien liegen physisch auf dem Homeserver (Docker Volume).

### Flow
```
Video/Bild von Instagram
  → n8n lädt Medien herunter
  → Backend (temp-Ordner im Container)
  → ffmpeg extrahiert Keyframes (bei Video)
  → LLM wählt besten Frame als Titelbild
  → Titelbild → Supabase Storage: recipe-images/{recipe_id}.jpg
  → URL wird in recipes.image_url gespeichert
  → Temp-Dateien werden gelöscht
```

### Storage-Struktur
```
supabase-storage/
└── recipe-images/
    ├── {recipe_id}.jpg       # Titelbild (dauerhaft)
    └── tmp/                  # Temporäre Dateien (werden nach Extraktion gelöscht)
```

### Zugriff
- Bilder sind nur für authentifizierte Nutzer zugänglich (Supabase Storage RLS)
- Frontend lädt Bilder direkt über die Supabase Storage URL
- Kein separater Fileserver nötig

---



### Projektstruktur anlegen
```
rezepte-app/
├── frontend/          # React PWA (Vite)
├── backend/           # FastAPI (LLM Abstraction + Queue-Handler)
├── n8n/               # n8n Workflow-Exports (JSON)
├── supabase/
│   └── migrations/    # SQL-Migrations
├── docker-compose.yml
└── .env.example
```

### docker-compose.yml Services
```yaml
services:
  frontend:      # Vite build → Nginx
  backend:       # FastAPI (Python)
  ollama:        # CPU-only image, llama3.2-vision:11b
  n8n:           # n8n self-hosted
  # Supabase self-hosted Stack (separate compose oder integriert)
```

### Phase 2 Aufgaben (Reihenfolge)
1. Projektstruktur + docker-compose Grundgerüst
2. Supabase self-hosted Setup + Migrations ausführen
3. Supabase Auth (Email/Password für 2 User)
4. Frontend: Mock-Daten durch echte Supabase-Queries ersetzen
5. Backend: LLM Abstraction Layer (Ollama + Claude API Fallback)
6. n8n: Telegram-Bot Workflow
7. n8n: Instagram Collection Poller Workflow
8. ffmpeg Integration für Video-Frame-Extraktion
9. PWA-Manifest + Share Target API ("Teilen" aus Handy/Browser)

---

## Übersetzung & Umrechnung

### Umrechnung
Reine Mathematik mit festen Faktoren – **kein LLM-Call nötig**. Läuft vollständig im Frontend, funktioniert offline. Faktoren sind unveränderlich (`1 cup = 236.588 ml`, `1 oz = 28.35 g` etc.).

### Übersetzung
LLM-Call on-demand, aber mit **DB-Cache** um wiederholte Calls zu vermeiden. Die Originalsprache bleibt immer unverändert in der DB.

#### Translations-Tabelle
```sql
CREATE TABLE translations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id   UUID REFERENCES recipes(id) ON DELETE CASCADE,
  lang        TEXT NOT NULL DEFAULT 'de',
  title       TEXT,
  ingredients JSONB,   -- [{id, name}, ...]
  steps       JSONB,   -- [{id, text}, ...]
  is_stale    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (recipe_id, lang)
);
```

#### Übersetzungs-Flow
```
Nutzer klickt "Übersetzen"
  → Übersetzung vorhanden + is_stale = false → sofort aus DB (kein LLM-Call)
  → Übersetzung vorhanden + is_stale = true  → LLM-Call → DB überschreiben → is_stale = false
  → Keine Übersetzung vorhanden              → LLM-Call → in DB speichern
```

#### Cache-Invalidierung via DB-Trigger
Wenn der Nutzer ein Rezept editiert (Titel, Zutaten oder Schritte), setzt ein Postgres-Trigger automatisch `is_stale = true` – ohne dass Frontend oder Backend sich darum kümmern müssen.

```sql
CREATE OR REPLACE FUNCTION mark_translations_stale()
RETURNS TRIGGER AS $
BEGIN
  UPDATE translations
  SET is_stale = true, updated_at = now()
  WHERE recipe_id = NEW.id;
  RETURN NEW;
END;
$ LANGUAGE plpgsql;

CREATE TRIGGER recipe_updated_stale_translations
AFTER UPDATE OF title ON recipes
FOR EACH ROW
WHEN (OLD.title IS DISTINCT FROM NEW.title)
EXECUTE FUNCTION mark_translations_stale();

-- Analog für ingredients und steps (AFTER UPDATE/INSERT/DELETE auf den jeweiligen Tabellen)
```

Der Nutzer bemerkt den Stale-Zustand nicht aktiv – er klickt "Übersetzen" und bekommt immer eine aktuelle Version, ggf. mit kurzer Wartezeit falls neu übersetzt werden muss.

---

## Offene Entscheidungen

| Thema | Status |
|---|---|
| Reverse Proxy | **Zoraxy** (self-hosted, bereits im Homelab vorhanden) |
| Instagram API | Siehe unten – Entscheidung getroffen |
| Supabase: Cloud oder self-hosted | Self-hosted bevorzugt (Homeserver-Philosophie) |
| Übersetzungs-Provider in Produktion | Claude API (bereits integriert) oder lokales Modell |

---

# ENV-Variablen (.env.example)

```
LLM_PROVIDER=ollama

OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=llama3.2-vision:11b

CLAUDE_API_KEY=
CLAUDE_MODEL=claude-opus-4-5

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o

OPENAI_COMPAT_BASE_URL=
OPENAI_COMPAT_API_KEY=
OPENAI_COMPAT_MODEL=

SUPABASE_URL=http://supabase:8000
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=

TELEGRAM_BOT_TOKEN=

INSTAGRAM_USERNAME=
INSTAGRAM_PASSWORD=
INSTAGRAM_COLLECTION_ID=

YTDLP_COOKIES_FILE=

N8N_BASIC_AUTH_USER=
N8N_BASIC_AUTH_PASSWORD=
```

# Supabase
SUPABASE_URL=http://supabase:8000
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=

# Telegram
TELEGRAM_BOT_TOKEN=

# Instagram
INSTAGRAM_USERNAME=
INSTAGRAM_PASSWORD=
INSTAGRAM_COLLECTION_ID=

# n8n
N8N_BASIC_AUTH_USER=
N8N_BASIC_AUTH_PASSWORD=
```
