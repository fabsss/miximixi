# Miximixi – Deployment

## Dev-Rechner (Windows 11 / WSL2)

### Voraussetzungen

- Docker Desktop (mit WSL2-Backend)
- Node.js 20+
- Python 3.12+ + Poetry (`pip install poetry`)
- Git
- Playwright Chromium (für Website-Import): `playwright install chromium`

### Erstmaliges Setup

```bash
# 1. Repo klonen
git clone <repo-url> ~/git/miximixi
cd ~/git/miximixi

# 2. ENV anlegen
cp .env.example .env
# .env öffnen und Werte eintragen (mind. TELEGRAM_BOT_TOKEN + LLM_PROVIDER)

# 3. Docker-Stack starten (Supabase + n8n + Ollama)
docker compose -f docker-compose.dev.yml up -d

# Warten bis alle Services healthy sind (~60s)
docker compose -f docker-compose.dev.yml ps

# 4. Migrations ausführen (einmalig)
docker exec -it miximixi-supabase-db psql -U postgres -d postgres \
  -f /docker-entrypoint-initdb.d/001_initial.sql \
  -f /docker-entrypoint-initdb.d/002_translations.sql \
  -f /docker-entrypoint-initdb.d/003_schema_updates.sql

# 5. Supabase Keys auslesen
# → http://localhost:54323 (Supabase Studio) öffnen
# → Settings → API → anon key + service_role key in .env eintragen

# 6. Ollama Modell laden (einmalig, ~4 GB Download, dauert je nach Internet)
docker exec -it miximixi-ollama ollama pull llama3.2-vision:11b

# 7. Backend starten
cd backend
poetry install
poetry run uvicorn app.main:app --reload --port 8000

# 8. Frontend starten (ab Story 6)
cd frontend
npm install
npm run dev
```

### URLs (Dev)

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| Backend Docs | http://localhost:8000/docs |
| Supabase Studio | http://localhost:54323 |
| n8n | http://localhost:5678 |
| Ollama | http://localhost:11434 |

### Dev-Tipps

- **Schnellste LLM-Tests:** `LLM_PROVIDER=gemini` in `.env` setzen – Gemini API ist sofort verfügbar, verarbeitet Videos nativ (kein ffmpeg Frame-Splitting), extrahiert Rezept + Foto in einem API-Call, kein Modell-Download nötig. API-Key: https://aistudio.google.com/apikey
- **Supabase zurücksetzen:** `docker compose -f docker-compose.dev.yml down -v` (löscht alle Daten!)
- **n8n Workflows laden:** n8n UI → Workflows → Import from File → `n8n/*.json`
- **Logs:** `docker compose -f docker-compose.dev.yml logs -f backend`

### ENV für Dev (Minimum)

```env
# .env (Dev)
# Empfohlen: Gemini (native Video-Analyse, kein Modell-Download, sofort verfügbar)
LLM_PROVIDER=gemini

GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-2.0-flash

# Alternative Cloud-Optionen
# CLAUDE_API_KEY=sk-ant-...
# CLAUDE_MODEL=claude-sonnet-4-6

SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=<aus Supabase Studio>
SUPABASE_SERVICE_KEY=<aus Supabase Studio>

TELEGRAM_BOT_TOKEN=<von @BotFather>

INSTAGRAM_USERNAME=fabian.rezepte
INSTAGRAM_PASSWORD=<Passwort>
INSTAGRAM_COLLECTION_ID=<Collection-ID>
```

---

## Home Server (Self-Hosted, Docker Compose)

### Voraussetzungen

- Linux (Ubuntu 22.04+ empfohlen) oder Windows Server mit Docker
- Docker + Docker Compose Plugin (`docker compose` – nicht `docker-compose`)
- Zoraxy (bereits vorhanden als Reverse Proxy)
- Mindestens 8 GB RAM (Ollama CPU-Inferenz braucht ~6 GB)
- Mindestens 20 GB freier Speicher (Modell ~4 GB + Daten)

### Erstmaliges Deployment

```bash
# 1. Repo klonen
git clone <repo-url> /opt/miximixi
cd /opt/miximixi

# 2. ENV befüllen
cp .env.example .env
nano .env   # Alle Keys eintragen

# 3. Stack starten
docker compose up -d

# 4. Warten bis healthy
docker compose ps
# Alle Services sollten "healthy" oder "running" sein

# 5. Migrations ausführen (einmalig)
docker exec -it miximixi-supabase-db psql -U postgres -d postgres \
  -f /docker-entrypoint-initdb.d/001_initial.sql \
  -f /docker-entrypoint-initdb.d/002_translations.sql

# 6. Supabase Keys auslesen
# → Supabase Studio öffnen (Port 3000 oder via Zoraxy)
# → Settings → API → Keys in .env eintragen
# → docker compose up -d (neu starten mit Keys)

# 7. Ollama Modell laden (einmalig – dauert auf CPU lange!)
docker exec -it miximixi-ollama ollama pull llama3.2-vision:11b

# 8. n8n Workflows importieren
# → n8n UI öffnen → Workflows → Import from File
# → n8n/telegram_import.json importieren + aktivieren
# → n8n/instagram_poller.json importieren + aktivieren

# 9. Zwei Supabase-User anlegen
# → Supabase Studio → Authentication → Users → Invite User
# → fabian@... und freundin@... einladen
```

### Zoraxy konfigurieren

Zoraxy UI öffnen → Proxy Rules hinzufügen:

| Hostname | Backend | Hinweis |
|----------|---------|---------|
| `rezepte.beispiel.local` | `127.0.0.1:80` | React PWA |
| `api.rezepte.beispiel.local` | `127.0.0.1:8000` | FastAPI |
| `n8n.rezepte.beispiel.local` | `127.0.0.1:5678` | n8n Admin |
| `supabase.rezepte.beispiel.local` | `127.0.0.1:3000` | Supabase Studio |

> Hostnamen anpassen auf deine lokale Domain.

### Services-Übersicht

| Container | Port (Host) | Beschreibung |
|-----------|-------------|--------------|
| miximixi-frontend | 80 | React PWA (Nginx) |
| miximixi-backend | 8000 | FastAPI |
| miximixi-ollama | 11434 | LLM CPU-Inferenz |
| miximixi-n8n | 5678 | Import-Workflows |
| miximixi-supabase-db | 5432 | PostgreSQL (intern) |
| miximixi-supabase-api | 54321 | PostgREST + GoTrue |
| miximixi-supabase-studio | 54323 | Supabase Admin UI |

### Updates einspielen

```bash
cd /opt/miximixi
git pull

# Nur geänderte Services neu bauen
docker compose build frontend backend
docker compose up -d --no-deps frontend backend

# Bei Schema-Änderungen: neue Migration ausführen
docker exec -it miximixi-supabase-db psql -U postgres -d postgres \
  -f /docker-entrypoint-initdb.d/003_new_migration.sql
```

### Backup

```bash
# Tägliches Backup-Skript (als Cronjob einrichten)
#!/bin/bash
BACKUP_DIR="/opt/miximixi-backups/$(date +%Y%m%d)"
mkdir -p "$BACKUP_DIR"

# Datenbank
docker exec miximixi-supabase-db pg_dump -U postgres postgres \
  > "$BACKUP_DIR/database.sql"

# Bilder (Supabase Storage)
docker cp miximixi-supabase-storage:/var/lib/storage "$BACKUP_DIR/storage"

# Alte Backups löschen (älter als 30 Tage)
find /opt/miximixi-backups -maxdepth 1 -mtime +30 -exec rm -rf {} \;

echo "Backup abgeschlossen: $BACKUP_DIR"
```

Cronjob einrichten:
```bash
crontab -e
# Täglich um 3:00 Uhr
0 3 * * * /opt/miximixi/scripts/backup.sh >> /var/log/miximixi-backup.log 2>&1
```

### Restore

```bash
# Datenbank wiederherstellen
docker exec -i miximixi-supabase-db psql -U postgres postgres < backup/database.sql

# Bilder wiederherstellen
docker cp backup/storage/. miximixi-supabase-storage:/var/lib/storage/
```

---

## Troubleshooting

### Ollama zu langsam
- CPU-Inferenz mit `llama3.2-vision:11b` dauert 2–10 Min pro Rezept – das ist normal
- Für schnellere Extraktion: `LLM_PROVIDER=claude` in `.env` (kostenpflichtig, aber sofort)

### Instagram-Login schlägt fehl
- Einmalig manuell einloggen: `docker exec -it miximixi-backend python -m app.instagram_login`
- Session wird gecacht, danach funktioniert Polling automatisch

### n8n Workflow startet nicht
- Webhook-URL muss von außen erreichbar sein (für Telegram-Bot)
- Zoraxy SSL für `n8n.domain.local` konfigurieren
- In n8n: Settings → Webhook URL auf externe URL setzen

### Supabase Studio nicht erreichbar
- `docker compose logs supabase-studio` prüfen
- Oft: Studio startet erst nach DB-Healthcheck (60s warten)
