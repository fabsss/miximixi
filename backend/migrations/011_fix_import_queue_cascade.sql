-- Fix foreign key constraint on import_queue.recipe_id to include ON DELETE CASCADE
-- This allows recipes to be deleted even if they have import queue entries

-- Drop the existing foreign key constraint
ALTER TABLE import_queue
  DROP CONSTRAINT import_queue_recipe_id_fkey;

-- Add the constraint back with ON DELETE CASCADE
ALTER TABLE import_queue
  ADD CONSTRAINT import_queue_recipe_id_fkey
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE;
