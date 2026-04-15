#!/usr/bin/env python3
"""
Migriert Rezeptbilder von der alten flachen Struktur zu neuer verschachtelter Ordner-Struktur.

Alte Struktur:
  /data/recipe-images/
    12df9f45.jpg
    12df9f45-step-1-frame.jpg
    12df9f45-step-2-frame.jpg

Neue Struktur:
  /data/recipe-images/
    12df9f45/
      cover.jpg
      step-1-frame.jpg
      step-2-frame.jpg
"""
import os
import re
import shutil
import logging
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

IMAGES_DIR = "/data/recipe-images"


def migrate_images():
    """Migriert alle Bilder von alter zu neuer Struktur."""
    if not os.path.exists(IMAGES_DIR):
        logger.warning(f"Ordner {IMAGES_DIR} existiert nicht. Migration abgebrochen.")
        return

    files = os.listdir(IMAGES_DIR)
    cover_count = 0
    step_count = 0
    skipped = 0

    # Pattern für alte Step-Bilder: {recipe_id}-step-{step_id}-frame.jpg
    step_pattern = re.compile(r'^([a-f0-9\-]+)-step-(\d+)-frame\.jpg$')
    # Pattern für alte Cover-Bilder: {recipe_id}.jpg
    cover_pattern = re.compile(r'^([a-f0-9\-]+)\.jpg$')

    for filename in sorted(files):
        filepath = os.path.join(IMAGES_DIR, filename)

        # Überspringe Ordner (neue Struktur)
        if os.path.isdir(filepath):
            logger.debug(f"Überspringe Ordner: {filename}")
            skipped += 1
            continue

        # Überspringe nicht-JPEG Dateien
        if not filename.lower().endswith('.jpg'):
            logger.debug(f"Überspringe Nicht-JPEG: {filename}")
            skipped += 1
            continue

        # Versuche Step-Bild zu erkennen
        step_match = step_pattern.match(filename)
        if step_match:
            recipe_id = step_match.group(1)
            step_id = step_match.group(2)

            recipe_dir = os.path.join(IMAGES_DIR, recipe_id)
            os.makedirs(recipe_dir, exist_ok=True)

            new_filename = f"step-{step_id}-frame.jpg"
            new_filepath = os.path.join(recipe_dir, new_filename)

            try:
                shutil.move(filepath, new_filepath)
                logger.info(f"✓ Step-Bild: {filename} → {recipe_id}/{new_filename}")
                step_count += 1
            except Exception as e:
                logger.error(f"✗ Fehler bei Step-Bild {filename}: {e}")
            continue

        # Versuche Cover-Bild zu erkennen
        cover_match = cover_pattern.match(filename)
        if cover_match:
            recipe_id = cover_match.group(1)

            recipe_dir = os.path.join(IMAGES_DIR, recipe_id)
            os.makedirs(recipe_dir, exist_ok=True)

            new_filename = "cover.jpg"
            new_filepath = os.path.join(recipe_dir, new_filename)

            try:
                shutil.move(filepath, new_filepath)
                logger.info(f"✓ Cover-Bild: {filename} → {recipe_id}/{new_filename}")
                cover_count += 1
            except Exception as e:
                logger.error(f"✗ Fehler bei Cover-Bild {filename}: {e}")
            continue

        # Unbekanntes Format
        logger.warning(f"⚠ Unbekanntes Format: {filename}")
        skipped += 1

    logger.info(f"\n{'='*60}")
    logger.info(f"Migration abgeschlossen!")
    logger.info(f"  Cover-Bilder migriert: {cover_count}")
    logger.info(f"  Step-Bilder migriert: {step_count}")
    logger.info(f"  Übersprungen: {skipped}")
    logger.info(f"{'='*60}")


if __name__ == "__main__":
    migrate_images()
