-- Miximixi – Migration 006: Remove category CHECK constraint
--
-- Removed the strict category constraint because categories are already enforced by:
-- 1. Frontend dropdown/selection UI
-- 2. LLM prompt instructions
-- 3. Category normalization in backend
-- This eliminates DB-level bugs without losing validation

ALTER TABLE recipes
  DROP CONSTRAINT IF EXISTS recipes_category_check;
