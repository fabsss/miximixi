#!/bin/bash
# Apply all migrations in order to PostgreSQL
# Usage: ./run_migrations.sh
# or with Docker: docker compose exec miximixi-db bash /docker-entrypoint-initdb.d/run_migrations.sh

set -e

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-miximixi}"

echo "🔄 Applying Miximixi migrations..."
echo "Target: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# List of migrations in order
MIGRATIONS=(
  "001_initial.sql"
  "002_translations.sql"
  "003_schema_updates.sql"
  "004_step_image_filename.sql"
  "005_ingredient_group.sql"
  "006_category_constraint.sql"
  "007_telegram_chat_id.sql"
  "008_instagram_sync_state.sql"
  "009_instagram_sync_collections.sql"
  "010_admin_users.sql"
  "011_fix_import_queue_cascade.sql"
)

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Apply each migration
for migration in "${MIGRATIONS[@]}"; do
  FILE="${SCRIPT_DIR}/${migration}"
  
  if [ ! -f "$FILE" ]; then
    echo "⚠️  Skipping missing: $migration"
    continue
  fi
  
  echo "📝 Applying: $migration..."
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$FILE" > /dev/null 2>&1 && \
    echo "✅ Applied: $migration" || \
    echo "⚠️  (Already applied or error): $migration"
done

echo "✅ All migrations processed!"
