# Database Migrations

All database migrations are stored here and automatically applied when the PostgreSQL container starts for the first time.

## Migrations

| # | File | Purpose |
|---|------|---------|
| 1 | `001_initial.sql` | Core schema (recipes, ingredients, steps, import_queue, users) |
| 2 | `002_translations.sql` | Multi-language support with stale translation triggers |
| 3 | `003_schema_updates.sql` | Enhanced extraction (raw_source_text, llm_provider_used, extraction_status) |
| 4 | `004_step_image_filename.sql` | Step image extraction from videos |
| 5 | `005_ingredient_group.sql` | Ingredient grouping (e.g., "For the sauce") |
| 6 | `006_category_constraint.sql` | Remove strict category check constraint |
| 7 | `007_telegram_chat_id.sql` | Telegram chat ID column for user notifications **← FIXES "Fehler beim Einreihen" error** |
| 8 | `008_instagram_sync_state.sql` | Track Instagram posts processed |
| 9 | `009_instagram_sync_collections.sql` | Instagram collections config |
| 10 | `010_admin_users.sql` | Telegram admin users for sync commands |

## Automatic Application (Container Startup)

When you start Docker for the first time with a **fresh database**, PostgreSQL automatically executes all `.sql` files in `/docker-entrypoint-initdb.d` in alphabetical order:

```bash
docker-compose up -d
# PostgreSQL runs migrations automatically on first startup
```

## Manual Migration (Existing Database)

If your database already exists and was created before migrations were moved to `backend/migrations/`, you need to apply them manually.

### Option 1: Fresh Start (Recommended)
```bash
# Delete existing database and volumes
docker-compose down -v

# Start with clean migrations
docker-compose up -d

# Verify migrations ran
docker exec miximixi-db psql -U postgres -d miximixi -c "\d import_queue"
# Should show: telegram_chat_id | character varying | (if migration 007 ran) ✅
```

### Option 2: Apply to Existing Database

**Using bash script (Linux/Mac):**
```bash
chmod +x backend/migrations/run_migrations.sh

# Option 2a: Docker container
docker exec miximixi-db bash /docker-entrypoint-initdb.d/run_migrations.sh

# Option 2b: Local PostgreSQL
export DB_USER=postgres DB_PASSWORD=your-password DB_HOST=localhost
./backend/migrations/run_migrations.sh
```

**Using PowerShell (Windows):**
```powershell
# Option 2a: Docker container
docker exec miximixi-db pwsh /docker-entrypoint-initdb.d/run_migrations.ps1

# Option 2b: Local PostgreSQL (ensure psql is in PATH)
$env:DB_USER = "postgres"
$env:DB_PASSWORD = "your-password"
$env:DB_HOST = "localhost"
.\backend\migrations\run_migrations.ps1
```

**Using psql directly:**
```bash
# Apply all migrations in order
for i in 001 002 003 004 005 006 007 008 009 010; do
  psql -U postgres -d miximixi < backend/migrations/${i}_*.sql
done

# Or apply one at a time
psql -U postgres -d miximixi -f backend/migrations/007_telegram_chat_id.sql
```

## Verify Migrations Ran

Check if the `telegram_chat_id` column exists (indicates migrations worked):

```bash
docker exec miximixi-db psql -U postgres -d miximixi -c "
  SELECT column_name FROM information_schema.columns 
  WHERE table_name = 'import_queue' AND column_name = 'telegram_chat_id';
"
```

**Expected output (if migration 007 ran):**
```
 column_name
─────────────
 telegram_chat_id
(1 row)
```

## Troubleshooting

### Migration Failed / Already Applied
Most migrations use `IF NOT EXISTS` / `IF NOT EXISTS` to be idempotent. If a migration partially ran before:
- Manually run the individual migration: `psql -U postgres -d miximixi -f 007_telegram_chat_id.sql`
- Check the actual schema: `\d import_queue` in psql

### psql Command Not Found
Install PostgreSQL client tools:
- **macOS:** `brew install postgresql`
- **Ubuntu/Debian:** `sudo apt-get install postgresql-client`
- **Windows:** Install PostgreSQL or [pgAdmin](https://www.pgadmin.org/)

### Cannot Connect to Database
Ensure:
1. Database is running: `docker ps | grep miximixi-db`
2. Port 5432 is available
3. Credentials in `.env` are correct
4. Wait 10-30s for DB startup: `docker logs miximixi-db`

## Adding New Migrations

1. Create new file: `backend/migrations/NNN_description.sql`
   - Naming: `001`, `002`, etc. in sequential order
   - Use `IF NOT EXISTS` / `IF NOT EXISTS` for idempotency

2. Example:
   ```sql
   -- backend/migrations/011_add_user_preferences.sql
   CREATE TABLE IF NOT EXISTS user_preferences (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     language TEXT DEFAULT 'de',
     created_at TIMESTAMPTZ DEFAULT now()
   );
   ```

3. Test locally:
   ```bash
   docker-compose down -v
   docker-compose up -d
   # Verify migration ran
   ```

4. Commit and push:
   ```bash
   git add backend/migrations/011_add_user_preferences.sql
   git commit -m "[backend] Add user preferences table (migration 011)"
   git push origin main
   ```

---

**Key Point:** Migrations automatically run on **first container startup**. For existing databases, use the migration scripts above.
