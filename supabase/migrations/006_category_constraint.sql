-- Miximixi – Migration 006: Strict category CHECK constraint
--
-- Enforces that recipes.category must be one of the four valid values.
-- Existing rows with non-conforming values must be updated before applying.

-- Drop old unconstrained check (if any) and re-add with explicit name
ALTER TABLE recipes
  DROP CONSTRAINT IF EXISTS recipes_category_check;

ALTER TABLE recipes
  ADD CONSTRAINT recipes_category_check
    CHECK (category IS NULL OR category IN ('Vorspeisen', 'Hauptspeisen', 'Dessert', 'Frühstück', 'Snack', 'Getränke'));
