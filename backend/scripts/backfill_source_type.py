#!/usr/bin/env python3
"""
Backfill source_type and source_id for existing recipes.

IMPORTANT: Run this AFTER migration 012_recipe_source_tracking.sql
BEFORE the deduplication system goes live.

Without this backfill, old recipes will not be detected as duplicates
when the same content is imported again.

Usage:
    cd backend && poetry run python scripts/backfill_source_type.py
"""
import sys
import os
import psycopg2
from psycopg2.extras import RealDictCursor

# Add backend to path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.source_identifier import extract_source_id, get_source_type_from_url
from app.config import settings


def backfill():
    """Backfill source_type and source_id for all recipes without them."""
    db = psycopg2.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        database=settings.db_name,
    )
    cursor = db.cursor(cursor_factory=RealDictCursor)

    try:
        # Get recipes that need source_type/source_id corrections
        # This includes recipes where source_type was set to 'web' but URL indicates Instagram/YouTube
        cursor.execute("""
            SELECT id, source_url, source_type
            FROM recipes
            WHERE source_type IS NULL
               OR (source_url LIKE '%instagram.com%' AND source_type != 'instagram')
               OR (source_url LIKE '%instagr.am%' AND source_type != 'instagram')
               OR (source_url LIKE '%youtube.com%' AND source_type != 'youtube')
               OR (source_url LIKE '%youtu.be%' AND source_type != 'youtube')
        """)
        recipes = cursor.fetchall()

        if not recipes:
            print("✓ No recipes need backfilling (all have correct source_type set)")
            return

        print(f"Backfilling {len(recipes)} recipes...")

        updated = 0
        for recipe in recipes:
            source_url = recipe['source_url']

            # Use the same extraction logic as the import system
            source_type = get_source_type_from_url(source_url)
            source_id = extract_source_id(source_url) if source_type != 'web' else None

            cursor.execute(
                "UPDATE recipes SET source_type = %s, source_id = %s WHERE id = %s",
                (source_type, source_id, recipe['id'])
            )
            updated += 1

            if updated % 100 == 0:
                print(f"  ... updated {updated}/{len(recipes)}")

        db.commit()

        # Print summary by source type
        cursor.execute(
            "SELECT source_type, COUNT(*) as count FROM recipes GROUP BY source_type ORDER BY count DESC"
        )
        summary = cursor.fetchall()

        print(f"\n✓ Backfill complete! Summary by source type:")
        for row in summary:
            print(f"  {row['source_type']:12} {row['count']:5} recipes")

    except Exception as e:
        print(f"✗ Error during backfill: {e}")
        db.rollback()
        raise

    finally:
        db.close()


if __name__ == "__main__":
    backfill()
