# Miximixi – Implementierungsplan

## Context
Private Rezepte-App für 2 Nutzer (Fabian + Freundin). Der wichtigste Teil der App ist der automatische Import-Workflow: Links (Instagram / YouTube / Website) → Telegram Bot → LLM-Extraktion → Supabase. Dieser wird zuerst entwickelt und validiert. Das vollständige Frontend kommt danach.

**Strategie:** Backend-first. Import-Pipeline zuerst, dann einfache Verifikations-Seite, dann vollständiges Frontend.

**Prioritäten:** Telegram Import → Instagram Collection Sync → Verifikations-Frontend → vollständiges Frontend

---

## Implementierungsstand

### ✅ Bereits implementiert

| Bereich | Was |
|---------|-----|
| Backend | FastAPI-Grundstruktur (`main.py`, `config.py`, `models.py`) |
| Backend | LLM Abstraction Layer (`llm_provider.py`) mit Gemini, Claude, OpenAI, Ollama |
| Backend | Queue Worker (`queue_worker.py`) |
| Backend | Media Processor (`media_processor.py`) |
| Backend | Instagram Service (`instagram_service.py`) |
| Backend | Dockerfile + Poetry Setup |
| DB | Migration `001_initial.sql` – recipes, ingredients, steps, import_queue |
| DB | Migration `002_translations.sql` – Übersetzungs-Cache + Stale-Trigger |
| n8n | Telegram-Import Workflow (`telegram_import.json`) |
| n8n | Instagram Collection Poller (`instagram_poller.json`) |
| n8n | Dockerfile |
| Infra | `docker-compose.yml` + `docker-compose.dev.yml` |
| Frontend | `verify.html` (minimale Verifikationsseite) |

### ❌ Noch nicht implementiert (aus aktuellem Design)

| Bereich | Was | Story |
|---------|-----|-------|
| DB | `raw_source_text`, `extraction_status`, `llm_provider_used` in `recipes` | Story 1b |
| DB | `needs_review` Status in `import_queue` | Story 1b |
| DB | `source_type` um `youtube` erweitern | Story 1b |
| Backend | Gemini: Foto-Extraktion (Base64) im selben API-Call wie Rezept | Story 2b |
| Backend | Andere Provider: ffmpeg → 5 Frames → LLM wählt besten Frame | Story 2b |
| Backend | Website-Import via Playwright (Screenshot + HTML) | Story 2c |
| Backend | YouTube-Import via yt-dlp (bereits in n8n, aber Backend-Seite fehlt) | Story 2c |
| Backend | Fallback-Kaskade: raw_source_text → needs_review → Telegram-Benachrichtigung | Story 2d |
| Frontend | Vollständiges React-Frontend (Phase 2) | Story 6+ |

---

## Phase 1: Backend + Import-Pipeline

| Story | Titel | Status |
|-------|-------|--------|
| 0 | Docs + Projektstruktur | ✅ Erledigt |
| 1a | Supabase + Migrations (001 + 002) | ✅ Erledigt |
| 1b | Migration 003: raw_source_text, extraction_status, youtube source_type | ✅ Erledigt |
| 2a | FastAPI + LLM Abstraction (Gemini, Claude, OpenAI, Ollama) | ✅ Erledigt |
| 2b | Gemini: Foto-Extraktion + Fallback (partial / needs_review) | ✅ Erledigt |
| 2c | Website- + YouTube-Import (Playwright + yt-dlp) | ❌ Offen |
| 2d | Fallback-Kaskade + Telegram-Benachrichtigung bei needs_review | ❌ Offen |
| 3 | Telegram Import (n8n Workflow) | ✅ Erledigt |
| 4 | Instagram Collection Poller | ✅ Erledigt |
| 5 | Verifikations-Seite | ✅ Erledigt (verify.html) |

## Phase 2: Vollständiges Frontend (nach Pipeline-Validierung)

| Story | Titel | Status |
|-------|-------|--------|
| 6 | Design System + Shell-Layout | ❌ Offen |
| 7 | Recipe Feed | ❌ Offen |
| 8 | Recipe Detail | ❌ Offen |
| 9 | Cook Mode | ❌ Offen |
| 10 | Rating & Notes | ❌ Offen |
| 11 | Auth (Supabase) | ❌ Offen |
| 12 | Übersetzung + Recipe Editor | ❌ Offen |
| 13 | PWA + Share Target | ❌ Offen |

---

## Nächste Schritte (Reihenfolge)

1. **Story 1b** – Migration `003_schema_updates.sql` schreiben:
   - `raw_source_text TEXT` zu `recipes` hinzufügen
   - `extraction_status TEXT DEFAULT 'success'` zu `recipes` hinzufügen
   - `llm_provider_used TEXT` zu `recipes` hinzufügen
   - `needs_review` zu `import_queue.status` CHECK-Constraint hinzufügen
   - `youtube` zu `import_queue.source_type` CHECK-Constraint hinzufügen

2. **Story 2b** – `llm_provider.py` erweitern:
   - Gemini: `extract_recipe_and_image()` – 1 API-Call, gibt `(ExtractedRecipe, image_base64 | None)` zurück
   - Andere Provider: ffmpeg → 5 Frames → LLM wählt besten Frame-Index → Frame extrahieren

3. **Story 2c** – Website/YouTube-Import:
   - yt-dlp für YouTube in Queue-Worker einbinden
   - Playwright für Website-Screenshots + HTML-Extraktion

4. **Story 2d** – Fallback-Logik:
   - `raw_source_text` immer speichern (vor LLM-Call)
   - Bei Fehler: Text-Fallback versuchen → `extraction_status = 'partial'`
   - Bei komplettem Fehler: `needs_review` + Telegram-Benachrichtigung

---

## Projektstruktur

```
miximixi/
├── docs/                    # Alle Dokumentation
│   ├── plan.md
│   ├── deployment.md
│   ├── design-system.md
│   └── architecture.md
├── frontend/                # React PWA (Vite + Tailwind)
│   └── verify.html          # ✅ Minimale Verifikationsseite
├── backend/                 # FastAPI
│   └── app/
│       ├── main.py          # ✅
│       ├── config.py        # ✅
│       ├── models.py        # ✅
│       ├── llm_provider.py  # ✅ (Foto-Extraktion fehlt noch)
│       ├── queue_worker.py  # ✅
│       ├── media_processor.py # ✅
│       └── instagram_service.py # ✅
├── n8n/                     # n8n Workflow-Exports
│   ├── telegram_import.json # ✅
│   └── instagram_poller.json # ✅
├── supabase/
│   └── migrations/
│       ├── 001_initial.sql      # ✅
│       ├── 002_translations.sql # ✅
│       └── 003_schema_updates.sql # ✅
├── docker-compose.yml       # ✅ Produktion
├── docker-compose.dev.yml   # ✅ Lokale Entwicklung
└── .env.example             # ✅
```
