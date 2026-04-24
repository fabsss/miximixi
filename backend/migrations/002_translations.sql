-- Miximixi – Migration 002: Translations + Stale-Trigger

-- ── Translations Table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS translations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id   UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  lang        TEXT NOT NULL DEFAULT 'de',
  title       TEXT,
  ingredients JSONB,   -- [{id, name}, ...]
  steps       JSONB,   -- [{id, text}, ...]
  is_stale    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (recipe_id, lang)
);

CREATE INDEX IF NOT EXISTS translations_recipe_id_idx ON translations (recipe_id);

-- ── updated_at Trigger ───────────────────────────────────────────────
DROP TRIGGER IF EXISTS translations_updated_at ON translations;
CREATE TRIGGER translations_updated_at
  BEFORE UPDATE ON translations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Stale-Translations Trigger ───────────────────────────────────────
-- Wenn ein Rezept (Titel, Zutaten oder Schritte) geändert wird,
-- werden alle gecachten Übersetzungen als "veraltet" markiert.
-- Das Frontend löst dann beim nächsten "Übersetzen"-Klick einen neuen LLM-Call aus.

CREATE OR REPLACE FUNCTION mark_translations_stale()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE translations
  SET is_stale = true, updated_at = now()
  WHERE recipe_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger auf recipes (Titeländerung)
DROP TRIGGER IF EXISTS recipe_title_changed_stale ON recipes;
CREATE TRIGGER recipe_title_changed_stale
  AFTER UPDATE OF title ON recipes
  FOR EACH ROW
  WHEN (OLD.title IS DISTINCT FROM NEW.title)
  EXECUTE FUNCTION mark_translations_stale();

-- Trigger auf ingredients (Zutatenliste geändert)
CREATE OR REPLACE FUNCTION mark_translations_stale_by_recipe()
RETURNS TRIGGER AS $$
DECLARE
  rid UUID;
BEGIN
  rid := COALESCE(NEW.recipe_id, OLD.recipe_id);
  UPDATE translations
  SET is_stale = true, updated_at = now()
  WHERE recipe_id = rid;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ingredients_changed_stale ON ingredients;
CREATE TRIGGER ingredients_changed_stale
  AFTER INSERT OR UPDATE OR DELETE ON ingredients
  FOR EACH ROW EXECUTE FUNCTION mark_translations_stale_by_recipe();

-- Trigger auf steps (Schritte geändert)
DROP TRIGGER IF EXISTS steps_changed_stale ON steps;
CREATE TRIGGER steps_changed_stale
  AFTER INSERT OR UPDATE OR DELETE ON steps
  FOR EACH ROW EXECUTE FUNCTION mark_translations_stale_by_recipe();
