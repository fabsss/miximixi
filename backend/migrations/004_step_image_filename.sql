-- Migration: Add step_image_filename column to steps table
-- This allows storing extracted step images from videos

ALTER TABLE steps ADD COLUMN IF NOT EXISTS step_image_filename VARCHAR(255) NULL;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_steps_step_image_filename ON steps(step_image_filename);
