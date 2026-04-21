-- Migration 013: Backfill source_type and source_id for existing recipes
-- Populates the new columns added in migration 012 using the source_url

-- This migration is a data-only update that:
-- 1. Extracts source_type from source_url pattern
-- 2. Extracts source_id (shortcode/video ID) from Instagram/YouTube URLs
-- 3. Sets source_id=NULL for web URLs

-- NOTE: This migration cannot use Python functions directly in SQL.
-- Instead, it uses pattern matching to detect Instagram/YouTube URLs and extract IDs.
-- For the best accuracy, run the backfill_source_type.py script instead.

-- Instagram: /p/{shortcode}/ or /reel/{shortcode}/ or /tv/{shortcode}/
UPDATE recipes
SET source_type = 'instagram',
    source_id = (
        CASE
            WHEN source_url ~ '/p/([A-Za-z0-9_-]+)/' THEN substring(source_url from '/p/([A-Za-z0-9_-]+)/')
            WHEN source_url ~ '/reel/([A-Za-z0-9_-]+)/' THEN substring(source_url from '/reel/([A-Za-z0-9_-]+)/')
            WHEN source_url ~ '/tv/([A-Za-z0-9_-]+)/' THEN substring(source_url from '/tv/([A-Za-z0-9_-]+)/')
            ELSE NULL
        END
    )
WHERE source_url LIKE '%instagram.com%' OR source_url LIKE '%instagr.am%'
  AND source_type IS NULL;

-- YouTube: watch?v={id} or youtu.be/{id}
UPDATE recipes
SET source_type = 'youtube',
    source_id = (
        CASE
            WHEN source_url ~ 'v=([A-Za-z0-9_-]{11})' THEN substring(source_url from 'v=([A-Za-z0-9_-]{11})')
            WHEN source_url ~ 'youtu\.be/([A-Za-z0-9_-]{11})' THEN substring(source_url from 'youtu\.be/([A-Za-z0-9_-]{11})')
            ELSE NULL
        END
    )
WHERE (source_url LIKE '%youtube.com%' OR source_url LIKE '%youtu.be%')
  AND source_type IS NULL;

-- Web: everything else gets source_type='web', source_id=NULL
UPDATE recipes
SET source_type = 'web',
    source_id = NULL
WHERE source_type IS NULL;
