#!/usr/bin/env python3
"""
Migration: Sync all step images from disk to database.

Scans /data/recipe-images/ for step image files and updates the database
with the filenames for recipes that have missing step_image_filename values.

This fixes the issue where step images were extracted but never persisted
to the database.

Usage:
  python migrate_sync_all_step_images.py
"""
import os
import re
import logging
import psycopg2
from pathlib import Path

from app.config import settings

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def sync_all_step_images():
    """Scan disk and update database with step image filenames for all recipes."""
    images_dir = Path(settings.images_dir)

    if not images_dir.exists():
        logger.warning(f"Images directory not found: {images_dir}")
        return

    try:
        conn = psycopg2.connect(
            host=settings.db_host,
            port=settings.db_port,
            database=settings.db_name,
            user=settings.db_user,
            password=settings.db_password,
        )
        cursor = conn.cursor()

        updated_count = 0
        skipped_count = 0
        recipes_processed = 0

        # Pattern: step-{sort_order}-frame.jpg
        step_pattern = re.compile(r'^step-(\d+)-frame\.jpg$')

        # Iterate over recipe directories
        for recipe_dir in sorted(images_dir.iterdir()):
            if not recipe_dir.is_dir():
                continue

            recipe_id = recipe_dir.name
            recipes_processed += 1

            # Find all step image files in this recipe directory
            for filename in sorted(recipe_dir.glob("step-*-frame.jpg")):
                match = step_pattern.match(filename.name)
                if not match:
                    logger.debug(f"Skipping non-matching file: {recipe_dir.name}/{filename.name}")
                    continue

                step_sort_order = int(match.group(1))

                # Update database
                cursor.execute(
                    """
                    UPDATE steps
                    SET step_image_filename = %s
                    WHERE recipe_id = %s AND sort_order = %s
                    """,
                    (filename.name, recipe_id, step_sort_order),
                )

                if cursor.rowcount > 0:
                    updated_count += 1
                    logger.info(f"✓ Updated: {recipe_id} step {step_sort_order} → {filename.name}")
                else:
                    logger.warning(f"⚠ No step found: {recipe_id} step {step_sort_order}")
                    skipped_count += 1

        conn.commit()
        cursor.close()
        conn.close()

        logger.info(f"\n{'='*60}")
        logger.info(f"Migration completed!")
        logger.info(f"  Recipes processed: {recipes_processed}")
        logger.info(f"  Steps updated: {updated_count}")
        logger.info(f"  Steps skipped: {skipped_count}")
        logger.info(f"{'='*60}")

    except Exception as e:
        logger.error(f"Migration failed: {e}")
        raise


if __name__ == "__main__":
    sync_all_step_images()
