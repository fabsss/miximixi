-- Miximixi – Migration 003: Schema-Updates für erweiterte Extraktion
--
-- Änderungen:
-- 1. recipes: raw_source_text, extraction_status, llm_provider_used
-- 2. import_queue: source_type + 'youtube', status + 'needs_review'

-- ── recipes: neue Spalten ─────────────────────────────────────────────

-- Rohtext aus Caption / YouTube-Beschreibung / HTML (immer gespeichert als Fallback)
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS raw_source_text TEXT;

-- Welcher LLM-Provider wurde verwendet (für Debugging + Nachvollziehbarkeit)
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS llm_provider_used TEXT;

-- Extraktions-Ergebnis:
--   success      = Rezept + Foto vollständig extrahiert
--   partial      = Rezept ok, aber kein Foto (image_url bleibt NULL)
--   needs_review = Extraktion fehlgeschlagen, Nutzer muss manuell prüfen
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS extraction_status TEXT NOT NULL DEFAULT 'success'
    CHECK (extraction_status IN ('success', 'partial', 'needs_review'));

-- ── import_queue: CHECK-Constraints erweitern ────────────────────────
-- PostgreSQL erlaubt kein direktes ALTER eines CHECK-Constraints –
-- alten droppen und neuen mit explizitem Namen anlegen.

-- source_type: 'youtube' hinzufügen
ALTER TABLE import_queue
  DROP CONSTRAINT IF EXISTS import_queue_source_type_check;

ALTER TABLE import_queue
  ADD CONSTRAINT import_queue_source_type_check
    CHECK (source_type IN ('instagram', 'youtube', 'web', 'telegram', 'manual'));

-- status: 'needs_review' hinzufügen
ALTER TABLE import_queue
  DROP CONSTRAINT IF EXISTS import_queue_status_check;

ALTER TABLE import_queue
  ADD CONSTRAINT import_queue_status_check
    CHECK (status IN ('pending', 'processing', 'done', 'error', 'needs_review'));

-- llm_provider_used auf import_queue (für Fehler-Tracking pro Job)
ALTER TABLE import_queue
  ADD COLUMN IF NOT EXISTS llm_provider_used TEXT;

-- ── import_queue: caption speichern (von n8n mitgeschickt) ──────────
-- Wird vom Worker als raw_source_text verwendet, falls yt-dlp keine Beschreibung liefert.
ALTER TABLE import_queue
  ADD COLUMN IF NOT EXISTS caption TEXT;

-- ── Index für häufige Abfrage: unvollständige Rezepte finden ─────────
CREATE INDEX IF NOT EXISTS recipes_extraction_status_idx
  ON recipes (extraction_status)
  WHERE extraction_status IN ('partial', 'needs_review');
