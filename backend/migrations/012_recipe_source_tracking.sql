-- Migration 012: Add source type and source ID for deduplication
-- Tracks platform-specific identifiers (shortcode, video ID) instead of full URL
-- Enables deduplication across URL format variations

-- Add columns to recipes table
ALTER TABLE recipes
ADD COLUMN IF NOT EXISTS source_type TEXT,
ADD COLUMN IF NOT EXISTS source_id TEXT;

-- Create unique constraint on (source_type, source_id) for platform-specific IDs
-- Allows multiple 'web' recipes since they don't have shortcodes
CREATE UNIQUE INDEX IF NOT EXISTS recipes_source_type_id_idx
  ON recipes (source_type, source_id)
  WHERE source_type IN ('instagram', 'youtube');

-- Index for queries by source
CREATE INDEX IF NOT EXISTS recipes_source_type_idx ON recipes (source_type);
CREATE INDEX IF NOT EXISTS recipes_source_id_idx ON recipes (source_id);
