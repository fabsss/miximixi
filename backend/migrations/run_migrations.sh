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

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Find all migration files matching NNN_*.sql pattern and sort by number
readarray -t MIGRATIONS < <(find "$SCRIPT_DIR" -maxdepth 1 -name '[0-9][0-9][0-9]_*.sql' | sort)

if [ ${#MIGRATIONS[@]} -eq 0 ]; then
  echo "❌ No migrations found in $SCRIPT_DIR"
  exit 1
fi

echo "📋 Found ${#MIGRATIONS[@]} migrations"

# Apply each migration
for FILE in "${MIGRATIONS[@]}"; do
  migration=$(basename "$FILE")

  echo "📝 Applying: $migration..."
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$FILE" > /dev/null 2>&1 && \
    echo "✅ Applied: $migration" || \
    echo "⚠️  (Already applied or error): $migration"
done

echo "✅ All migrations processed!"
