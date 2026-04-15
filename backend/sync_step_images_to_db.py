#!/usr/bin/env python3
"""
Syncs existing step image files from disk to the database.

Scans /data/recipe-images/{recipe_id}/ for step-*.jpg files and updates
the corresponding steps in the database with the filename.

Usage:
  python sync_step_images_to_db.py
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


def sync_step_images():
    """Scan disk and update database with step image filenames."""
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

        # Pattern: step-{step_id}-frame.jpg
        step_pattern = re.compile(r'^step-(\d+)-frame\.jpg$')

        # Iterate over recipe directories
        for recipe_dir in sorted(images_dir.iterdir()):
            if not recipe_dir.is_dir():
                continue

            recipe_id = recipe_dir.name

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
                    logger.info(f"✓ Updated: {recipe_id} step {step_sort_order} → {filename.name}")
                    updated_count += 1
                else:
                    logger.warning(f"⚠ No step found: {recipe_id} step {step_sort_order}")
                    skipped_count += 1

        conn.commit()
        cursor.close()
        conn.close()

        logger.info(f"\n{'='*60}")
        logger.info(f"Sync completed!")
        logger.info(f"  Updated: {updated_count}")
        logger.info(f"  Skipped: {skipped_count}")
        logger.info(f"{'='*60}")

    except Exception as e:
        logger.error(f"Sync failed: {e}")
        raise


if __name__ == "__main__":
    sync_step_images()
