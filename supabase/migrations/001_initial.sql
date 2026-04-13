-- Miximixi – Initial Schema
-- Migration 001: recipes, ingredients, steps, import_queue

-- ── Extensions ──────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Recipes ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recipes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  lang         TEXT DEFAULT 'de',          -- Originalsprache des Rezepts
  category     TEXT,
  servings     INT,
  prep_time    TEXT,
  cook_time    TEXT,
  tags         TEXT[],
  image_url    TEXT,                        -- Supabase Storage URL
  source_url   TEXT,                        -- Original-URL (Instagram, etc.)
  source_label TEXT,                        -- z.B. "@username"
  rating       SMALLINT CHECK (rating IN (-1, 1)),  -- NULL=unbewertet
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  created_by   UUID                         -- auth.users(id) – nullable für Import
);

-- ── Ingredients ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ingredients (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id  UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  name       TEXT NOT NULL,
  amount     NUMERIC,
  unit       TEXT
);

-- ── Steps ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS steps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id    UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  sort_order   INT NOT NULL DEFAULT 0,
  text         TEXT NOT NULL,              -- enthält {ingredient_id} Referenzen
  time_minutes INT                         -- NULL = kein Timer
);

-- ── Import Queue ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS import_queue (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url  TEXT NOT NULL,
  source_type TEXT CHECK (source_type IN ('instagram', 'telegram', 'web', 'manual')),
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'processing', 'done', 'error')),
  recipe_id   UUID REFERENCES recipes(id),  -- gesetzt wenn status=done
  error_msg   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Unique: gleiche URL nicht doppelt importieren
CREATE UNIQUE INDEX IF NOT EXISTS import_queue_source_url_idx
  ON import_queue (source_url)
  WHERE status IN ('pending', 'processing', 'done');

-- ── Indexes ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS recipes_category_idx ON recipes (category);
CREATE INDEX IF NOT EXISTS recipes_created_at_idx ON recipes (created_at DESC);
CREATE INDEX IF NOT EXISTS ingredients_recipe_id_idx ON ingredients (recipe_id, sort_order);
CREATE INDEX IF NOT EXISTS steps_recipe_id_idx ON steps (recipe_id, sort_order);
CREATE INDEX IF NOT EXISTS import_queue_status_idx ON import_queue (status, created_at);

-- ── updated_at Trigger ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER recipes_updated_at
  BEFORE UPDATE ON recipes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER import_queue_updated_at
  BEFORE UPDATE ON import_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_queue ENABLE ROW LEVEL SECURITY;

-- Alle authentifizierten User dürfen alles lesen und schreiben
-- (shared collection für 2 User – Fabian + Freundin)
CREATE POLICY "authenticated_all" ON recipes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON ingredients
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON steps
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON import_queue
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Service Role (Backend) kann ohne RLS-Einschränkung schreiben
-- (wird automatisch durch service_role JWT gewährt)
