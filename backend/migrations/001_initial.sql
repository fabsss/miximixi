-- Miximixi – Initial Schema (Plain PostgreSQL)
-- Migration 001: recipes, ingredients, steps, import_queue

-- ── Extensions ──────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username   TEXT UNIQUE NOT NULL,
  email      TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Recipes ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recipes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  lang         TEXT DEFAULT 'de',
  category     TEXT,
  servings     INT,
  prep_time    TEXT,
  cook_time    TEXT,
  tags         TEXT[],
  image_filename TEXT,                      -- Local filename: {recipe_id}.jpg
  source_url   TEXT,
  source_label TEXT,
  rating       SMALLINT CHECK (rating IN (-1, 0, 1)),
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL
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

DROP TRIGGER IF EXISTS recipes_updated_at ON recipes;
CREATE TRIGGER recipes_updated_at
  BEFORE UPDATE ON recipes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS import_queue_updated_at ON import_queue;
CREATE TRIGGER import_queue_updated_at
  BEFORE UPDATE ON import_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
