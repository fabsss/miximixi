# Apply all migrations in order to PostgreSQL (Windows/PowerShell)
# Usage: .\run_migrations.ps1
# or with Docker: docker compose exec miximixi-db pwsh .\run_migrations.ps1

$DB_HOST = $env:DB_HOST -or "localhost"
$DB_PORT = $env:DB_PORT -or "5432"
$DB_USER = $env:DB_USER -or "postgres"
$DB_NAME = $env:DB_NAME -or "miximixi"

Write-Host "🔄 Applying Miximixi migrations..." -ForegroundColor Cyan
Write-Host "Target: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

$migrations = @(
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
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

foreach ($migration in $migrations) {
  $file = Join-Path $scriptDir $migration
  
  if (-not (Test-Path $file)) {
    Write-Host "⚠️  Skipping missing: $migration" -ForegroundColor Yellow
    continue
  }
  
  Write-Host "📝 Applying: $migration..." -ForegroundColor Blue
  
  # Run migration
  $env:PGPASSWORD = $env:DB_PASSWORD
  $result = & psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f $file 2>&1
  
  if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Applied: $migration" -ForegroundColor Green
  } else {
    Write-Host "⚠️  (Already applied or error): $migration" -ForegroundColor Yellow
  }
}

Write-Host "✅ All migrations processed!" -ForegroundColor Green
