#!/usr/bin/env python3
"""
Run database migrations from the migrations/ directory.
This should be executed during deployment before starting the app.

Usage:
  python run_migrations.py
"""
import os
import logging
import psycopg2
from pathlib import Path

from app.config import settings

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def run_migrations():
    """Execute all SQL migrations from the migrations/ directory."""
    migrations_dir = Path(__file__).parent / "migrations"

    if not migrations_dir.exists():
        logger.warning(f"Migrations directory not found: {migrations_dir}")
        return

    migration_files = sorted(migrations_dir.glob("*.sql"))

    if not migration_files:
        logger.info("No migration files found")
        return

    try:
        # Connect to database
        conn = psycopg2.connect(
            host=settings.db_host,
            port=settings.db_port,
            database=settings.db_name,
            user=settings.db_user,
            password=settings.db_password,
        )
        cursor = conn.cursor()

        for migration_file in migration_files:
            logger.info(f"Running migration: {migration_file.name}")

            with open(migration_file, 'r') as f:
                sql = f.read()

            try:
                cursor.execute(sql)
                conn.commit()
                logger.info(f"✓ Completed: {migration_file.name}")
            except Exception as e:
                conn.rollback()
                logger.error(f"✗ Failed: {migration_file.name}: {e}")
                raise

        cursor.close()
        conn.close()
        logger.info("All migrations completed successfully")

    except Exception as e:
        logger.error(f"Migration failed: {e}")
        raise


if __name__ == "__main__":
    run_migrations()
