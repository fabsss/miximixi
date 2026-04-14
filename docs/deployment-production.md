# Miximixi – Production Deployment (Self-Hosted Docker Compose)

Complete guide for deploying Miximixi on a home server or Linux VPS using Docker Compose.

## Prerequisites

### Hardware Requirements

- **CPU:** 4+ cores recommended (Ollama CPU inference uses multiple cores)
- **RAM:** 
  - **With cloud LLM (Gemini/Claude):** 8 GB minimum
    - 4 GB for PostgreSQL, n8n, backend
    - 4 GB buffer for OS and overhead
  - **With local Ollama (CPU):** 16 GB minimum
    - 8 GB for Ollama + LLM model inference
    - 4 GB for PostgreSQL, n8n, backend
    - 4 GB buffer for OS and overhead
- **Storage:** 50 GB minimum
  - 10 GB for LLM models (Ollama) — *Optional, only if using local LLM*
  - 30 GB for recipes, images, and database
  - 10 GB buffer for backups
  - *Tip: If using cloud LLM (Gemini/Claude), you can reduce this to ~30 GB total*
- **Network:** Static IP or stable hostname recommended

### Software Requirements

- **Linux** (Ubuntu 22.04 LTS recommended) or Windows Server 2019+
  - WSL2 on Windows is acceptable but not recommended for production
  - Consider Linux VM (KVM/Hyper-V) on Windows Server
  - macOS works but requires different instructions

- **Docker Engine 20.10+** – https://docs.docker.com/engine/install/
  ```bash
  # Ubuntu/Debian
  curl -fsSL https://get.docker.com -o get-docker.sh
  sudo sh get-docker.sh
  
  # Verify
  docker --version
  sudo docker run hello-world
  ```

- **Docker Compose Plugin 2.0+** (built into modern Docker Desktop, requires separate install on servers)
  ```bash
  # Check if available
  docker compose version
  
  # If missing, install via package manager
  sudo apt-get install docker-compose-plugin
  ```

- **Git** – https://git-scm.com/
  ```bash
  sudo apt-get install git
  ```

### Network Requirements

- **Inbound ports:**
  - **80** (HTTP) – reverse proxy redirects to 443
  - **443** (HTTPS) – main ingress point
  - **22** (SSH) – for remote management

- **Outbound:**
  - **443** (HTTPS) – for Gemini/Claude/OpenAI APIs
  - **443** (HTTPS) – for Telegram bot API
  - **443** (HTTPS) – for Instagram (if using yt-dlp)

### Optional: Reverse Proxy

Choose one reverse proxy to handle TLS termination and domain routing:

#### Option A: Zoraxy (if already installed)

Miximixi integrates with Zoraxy for virtual hosting. Handles HTTPS, domain routing, and rate limiting.

**Zoraxy setup:** https://zoraxy.aml.ink/

#### Option B: Traefik (Alternative)

Modern reverse proxy with automatic HTTPS.

**Installation:**
```bash
docker volume create traefik-acme
docker pull traefik:latest
```

Then use `docker-compose.traefik.yml` (see templates section below).

#### Option C: Nginx (Simple, Manual)

Traditional web server. Requires manual certificate management (certbot).

```bash
sudo apt-get install nginx certbot python3-certbot-nginx
```

---

## Production Setup (First Deployment)

### Step 1: Create Deployment User (Optional)

**Skip this step if:** You're running Docker in an unprivileged LXC container (e.g., on Proxmox)
- Docker root inside the container is already mapped to unprivileged UID on host
- Extra user adds complexity without significant security benefit

**Do this step if:** Running Docker directly on a host machine (physical server or privileged VM)
- Prevents accidental root-level operations
- Follows principle of least privilege

**If creating the user:**
```bash
sudo useradd -m -s /bin/bash miximixi
sudo usermod -aG docker miximixi
su - miximixi
```

**If skipping:** Run all commands below as your current user (usually `root` in LXC container)
```bash
# Just run docker compose directly
docker compose up -d
```

---

**Security note:** Services inside Docker containers run as non-root regardless (see Dockerfiles). This user is only for host-level operations.

### Step 2: Clone Repository

```bash
cd ~
git clone <repo-url> miximixi
cd ~/miximixi
```

Directory structure:
```
~/miximixi/
├── docker-compose.yml
├── .env
├── .env.example
├── backend/
├── frontend/
├── n8n/
├── supabase/migrations/  # Contains SQL migrations
└── docs/
```

### Step 3: Create Production `.env` File

```bash
cp .env.example .env
nano .env
```

Edit with production values:

```env
# ============================================
# LLM Configuration (CRITICAL CHOICE)
# ============================================
# NOTE: Choose ONE provider. Ollama is OPTIONAL.
# Recommended for production: Gemini or Claude
# (No local LLM needed unless you want zero API costs)

# Option A: Gemini (Cloud, Recommended for production)
# Fastest, native video, API metered but cheap
# Free tier: 50 calls/day, $0.075 per 1M tokens
# Cost: ~$0.003 per recipe
LLM_PROVIDER=gemini
GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-2.0-flash

# Option B: Claude (Cloud, Recommended for quality)
# High-quality extraction, token-based pricing
# ~$0.003 per recipe import
LLM_PROVIDER=claude
CLAUDE_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-6

# Option C: Ollama (Self-Hosted, CPU) — Optional
# Free but SLOW (2-10 min per recipe on CPU)
# Only use if you have spare CPU capacity and want zero API costs
# Requires Ollama service running (docker compose up -d ollama)
# LLM_PROVIDER=ollama
# OLLAMA_BASE_URL=http://ollama:11434
# OLLAMA_MODEL=llama3.2-vision:11b

# Option D: Gemma 3n (Self-Hosted, via Ollama) — Optional
# Faster than llama3.2, balanced speed/quality
# Requires 8-12GB VRAM available for inference
# Requires Ollama service running (docker compose up -d ollama)
# LLM_PROVIDER=gemma3n
# GEMMA3N_BASE_URL=http://ollama:11434
# GEMMA3N_MODEL=gemma3n:e4b

# ============================================
# PostgreSQL Database Configuration
# ============================================
# Use strong, random passwords (32+ chars)
DB_USER=postgres
DB_PASSWORD=<use $(openssl rand -base64 32)>
DB_NAME=miximixi
DB_HOST=db
DB_PORT=5432

# ============================================
# Telegram Integration (Error Notifications)
# ============================================
# Get token from @BotFather on Telegram
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
# Get chat ID: send message to bot, then:
# curl https://api.telegram.org/bot<TOKEN>/getUpdates | jq '.result[0].message.chat.id'
TELEGRAM_NOTIFY_CHAT_ID=987654321

# ============================================
# Instagram Integration (Saved Collection Polling)
# ============================================
# Use secondary/test account only
INSTAGRAM_USERNAME=test.account.123
INSTAGRAM_PASSWORD=<secure password>
INSTAGRAM_COLLECTION_ID=<collection numeric ID>

# ============================================
# Frontend Configuration
# ============================================
VITE_API_BASE_URL=https://api.rezepte.example.com

# ============================================
# n8n Configuration
# ============================================
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=<use $(openssl rand -base64 16)>
N8N_ENCRYPTION_KEY=<use $(openssl rand -base64 32)>

# ============================================
# Domain Configuration (for Zoraxy)
# ============================================
# These are used by docker-compose.yml labels
DOMAIN_NAME=rezepte.example.com
# Then proxy rules are:
# rezepte.example.com       → frontend:80
# api.rezepte.example.com   → backend:8000
# n8n.rezepte.example.com   → n8n:5678
```

**Generate secure random values:**
```bash
# DB_PASSWORD
openssl rand -base64 32

# N8N_BASIC_AUTH_PASSWORD
openssl rand -base64 16

# N8N_ENCRYPTION_KEY
openssl rand -base64 32
```

### LLM Provider Quick Decision Guide

| Provider | Speed | Cost | Requires | Notes |
|----------|-------|------|----------|-------|
| **Gemini** ⭐ | 3-5s | $0.003/recipe | API key only | Best for production |
| **Claude** | 5-10s | $0.003/recipe | API key only | High quality output |
| **Ollama** (optional) | 2-10min | $0 | 8-16GB RAM | Local, slow, CPU-bound |
| **OpenAI** | 5-10s | $0.01/recipe | API key only | Alternative cloud option |

**Recommendation:** Start with Gemini API (cheap, fast, no local setup). Only use Ollama if you want zero API costs and have spare CPU capacity.

### Step 4: Configure TLS Certificates

#### Option A: Zoraxy (Auto-Renews)

Zoraxy handles HTTPS automatically. Just set `DOMAIN_NAME` in `.env` and configure proxy rules (see Step 8).

#### Option B: Certbot + Let's Encrypt (Manual)

Install certbot:
```bash
sudo apt-get install certbot python3-certbot-nginx
```

Generate wildcard certificate for all subdomains:
```bash
sudo certbot certonly --manual \
  --preferred-challenges dns \
  -d "rezepte.example.com" \
  -d "*.rezepte.example.com"

# You'll be prompted to add DNS TXT record (follow instructions)
# Certificates saved to /etc/letsencrypt/live/rezepte.example.com/
```

Auto-renew:
```bash
sudo certbot renew --dry-run  # Test renewal
# Certbot auto-configures cron job for renewal
```

#### Option C: Self-Signed Certificate (Development Only)

```bash
# NOT for production!
openssl req -x509 -newkey rsa:4096 \
  -keyout key.pem -out cert.pem -days 365 -nodes \
  -subj "/CN=rezepte.example.com"
```

### Step 5: Start Docker Compose Stack

```bash
# Production compose file (no build, uses prebuilt images)
docker compose -f docker-compose.yml up -d
```

Wait for services to start (~60 seconds):
```bash
docker compose ps
```

**Required services** should be `Up` or `healthy`:
```
NAME              STATUS
miximixi-db       Up (healthy)
miximixi-backend  Up
miximixi-n8n      Up
```

**Optional services:**
```
NAME              STATUS
miximixi-ollama   Up  (only if LLM_PROVIDER=ollama or gemma3n)
miximixi-frontend Up  (only if frontend is enabled in docker-compose.yml)
```

**If services fail to start:**
```bash
# Check logs for specific service
docker compose logs db
docker compose logs backend

# Restart service
docker compose restart backend

# Restart entire stack
docker compose down
docker compose up -d
```

### Step 6: Verify Database Migrations

Migrations are automatically applied on first start. Verify they ran:

```bash
# Check PostgreSQL is running
docker compose ps db

# Connect to database and verify tables
docker exec -it miximixi-db psql -U postgres -d miximixi -c "SELECT tablename FROM pg_tables WHERE schemaname='public';"

# Expected output:
# recipes
# ingredients
# steps
# import_queue
# translations
# users
```

### Step 7: Configure Reverse Proxy (Zoraxy)

**Access Zoraxy UI:** https://zoraxy-server:9302

Add proxy rules for all Miximixi services:

| Hostname | Backend | Port | Protocol | Notes |
|----------|---------|------|----------|-------|
| `rezepte.example.com` | `miximixi-frontend` | 80 | HTTP | React PWA (Nginx) |
| `api.rezepte.example.com` | `miximixi-backend` | 8000 | HTTP | FastAPI |
| `n8n.rezepte.example.com` | `miximixi-n8n` | 5678 | HTTP | n8n workflows |

**Configure HTTPS:**
- Zoraxy → Proxy Rules → select rule → Enable HTTPS
- Choose certificate: Let's Encrypt auto-generate or select existing

**Test proxy:**
```bash
curl https://rezepte.example.com
# Should return React HTML

curl https://api.rezepte.example.com/health
# Should return {"status":"ok","llm_provider":"gemini"}
```

### Step 8: Pull LLM Models (Optional – only if using Ollama)

**Skip this step if you're using:**
- Gemini API (`LLM_PROVIDER=gemini`)
- Claude API (`LLM_PROVIDER=claude`)
- OpenAI API (`LLM_PROVIDER=openai`)
- Any other cloud LLM provider

**Only do this if using local Ollama** (`LLM_PROVIDER=ollama` or `LLM_PROVIDER=gemma3n`):

```bash
# First, verify ollama container is running
docker compose ps ollama

# Pull default model (llama3.2-vision)
docker exec -it miximixi-ollama ollama pull llama3.2-vision:11b

# OR pull Gemma 3n (faster, smaller, better for limited hardware)
docker exec -it miximixi-ollama ollama pull gemma3n:e4b
```

**Expected behavior:**
- First pull: downloads ~4-8 GB, takes 10-30 minutes depending on internet speed
- Subsequent starts: model loads from local cache (~1 min)

**Check progress:**
```bash
docker exec -it miximixi-ollama ollama list
```

### Step 9: Import n8n Workflows

These automate recipe imports from Telegram and Instagram:

1. Open n8n: https://n8n.rezepte.example.com

2. **Workflows → Import from File**

3. Select `n8n/telegram_import.json`

4. Click **Save**

5. Configure:
   - Telegram bot token (from @BotFather)
   - Backend webhook URL (https://api.rezepte.example.com/import)

6. **Activate** the workflow

7. Repeat for `n8n/instagram_poller.json`

8. Test:
   - Send message to Telegram bot with Instagram URL
   - Check import_queue in PostgreSQL:
   ```bash
   docker exec -it miximixi-db psql -U postgres -d miximixi \
     -c "SELECT id, source_url, status FROM import_queue ORDER BY created_at DESC LIMIT 5;"
   ```

---

## Service Architecture (Production)

### Container Network

All containers communicate via internal Docker network:

```
┌─────────────────────────────────────────────────────────┐
│ Docker Network (miximixi)                               │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────┐  ┌─────────┐  ┌────────┐  ┌─────────┐    │
│  │frontend │  │backend  │  │ ollama │  │  n8n    │    │
│  │(React)  │  │(FastAPI)│  │(LLM)   │  │(workflow)   │
│  └────┬────┘  └────┬────┘  └───┬────┘  └────┬────┘    │
│       │            │            │            │        │
│       └────────────┼────────────┼────────────┘        │
│                    │            │                      │
│              ┌─────▼────────────┴─────┐                │
│              │ PostgreSQL 15           │                │
│              │ ├─ recipes              │                │
│              │ ├─ ingredients          │                │
│              │ ├─ steps                │                │
│              │ ├─ import_queue         │                │
│              │ ├─ translations         │                │
│              │ └─ users                │                │
│              └─────┬────────────────────┘                │
│                    │                                    │
│       ┌────────────┴─────────────┬──────────┐           │
│       │                          │          │           │
│  ┌────▼──────┐         ┌────────▼─┐  ┌────▼──────┐    │
│  │db-data    │         │ollama-   │  │recipe-    │    │
│  │(database) │         │models    │  │images     │    │
│  └───────────┘         └──────────┘  │(local     │    │
│                                       │storage)   │    │
│                                       └───────────┘    │
│                                                         │
└─────────────────────────────────────────────────────────┘
        │                     │
        └─────────────────────┴────────────────┬──────┐
                                               │      │
                                       ┌───────▼────┐ │
                                       │Volumes:    │ │
                                       │- db-data   │ │
                                       │- recipe-   │ │
                                       │  images    │ │
                                       │- n8n-data  │ │
                                       │- backend-  │ │
                                       │  tmp       │ │
                                       │- ollama-   │ │
                                       │  models    │ │
                                       └────────────┘ │
                                                      │
                                        ┌─────────────▼──┐
                                        │Reverse Proxy   │
                                        │(Zoraxy/Traefik)│
                                        │ Port 80/443    │
                                        └────────────────┘
```

### Container Configuration

#### Frontend (React PWA)

```yaml
Image: miximixi-frontend:latest
Port: 80
CPU: 0.5 cores
Memory: 256 MB
Restart: always
Mounts:
  - config: /etc/nginx/conf.d/
  - letsencrypt: /etc/letsencrypt (if using certbot)
```

**Role:** Serves single-page app (React), handles client-side routing.

#### Backend (FastAPI)

```yaml
Image: miximixi-backend:latest
Port: 8000
CPU: 2 cores
Memory: 2 GB
Restart: always
Environment:
  - LLM_PROVIDER (from .env)
  - DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
  - TELEGRAM_BOT_TOKEN (optional)
Volumes:
  - recipe-images: /data/recipe-images/
  - backend-tmp: /tmp/miximixi/
```

**Role:** API endpoint for recipe imports, orchestrates LLM extraction, manages local file storage.

**Key endpoints:**
- `POST /import` – Queue recipe import from URL
- `GET /recipes` – List all recipes
- `GET /recipes/{recipe_id}` – Get recipe with ingredients and steps
- `GET /images/{recipe_id}` – Serve recipe cover image
- `GET /health` – Health check

#### PostgreSQL

```yaml
Image: postgres:15-alpine
Port: 5432 (internal only)
CPU: 2 cores
Memory: 4 GB
Restart: always
Environment:
  - POSTGRES_USER (from .env DB_USER)
  - POSTGRES_PASSWORD (from .env DB_PASSWORD)
  - POSTGRES_DB (from .env DB_NAME)
Volumes:
  - db-data: /var/lib/postgresql/data
  - migrations: /docker-entrypoint-initdb.d/
```

**Role:** Persistent database for recipes, ingredients, steps, import queue, translations, users.

**Auto-runs migrations** on first start from `docker-entrypoint-initdb.d/*.sql`.

**Schema:**
```
recipes           – Recipe metadata (title, category, source_url, etc.)
ingredients       – Recipe ingredients with amounts and grouping
steps             – Cooking instructions with timing
import_queue      – Pending/processing/done imports from URLs
translations      – Translated content + stale tracking
users             – For future multi-user support
```

**Access from backend:**
```python
import psycopg2
conn = psycopg2.connect(
    host=os.environ['DB_HOST'],
    port=os.environ['DB_PORT'],
    user=os.environ['DB_USER'],
    password=os.environ['DB_PASSWORD'],
    database=os.environ['DB_NAME']
)
```

#### Ollama (LLM Runtime) — Optional

**Only needed if:** `LLM_PROVIDER=ollama` or `LLM_PROVIDER=gemma3n`

**Skip this service if using:** Gemini, Claude, OpenAI, or other cloud LLM providers

```yaml
Image: ollama/ollama:latest
Port: 11434 (internal only, not exposed to internet)
CPU: 4 cores (all cores during inference)
Memory: 8 GB (all free RAM during inference)
Restart: always
Mounts:
  - ollama_data: /root/.ollama/
```

**Role:** Runs open-source LLMs locally (CPU-bound, no API costs).

**Performance:**
- Model load: ~30s (first request after restart)
- Inference: 2-10 minutes per recipe (depends on model size and CPU)
- Max concurrent: 1 (single request queue)

**Recommendation:** Use cloud LLM (Gemini/Claude) for production unless you have spare CPU capacity or want zero API costs.

#### n8n (Workflow Orchestration)

```yaml
Image: n8nio/n8n:latest
Port: 5678
CPU: 1 core
Memory: 1 GB
Restart: always
Mounts:
  - n8n_data: /home/node/.n8n/
Environment:
  - N8N_BASIC_AUTH_USER (from .env)
  - N8N_BASIC_AUTH_PASSWORD (from .env)
  - N8N_ENCRYPTION_KEY (from .env)
  - N8N_WEBHOOK_URL (external HTTPS URL for receiving webhooks)
```

**Role:** Receives Telegram/Instagram webhooks, triggers recipe imports via backend API.

---

## Maintenance & Operations

### Daily Operations

#### Check Service Health

```bash
# Quick health check
docker compose ps

# Detailed logs for last 100 lines
docker compose logs --tail 100

# Stream live logs
docker compose logs -f backend

# Check specific service
docker compose logs n8n
```

#### Monitor Resource Usage

```bash
# CPU, memory, I/O per container
docker stats

# Database size
docker exec miximixi-db du -sh /var/lib/postgresql/data

# Image storage usage
du -sh /var/lib/docker/volumes/miximixi_recipe-images/_data

# Overall Docker volume usage
df -h /var/lib/docker/volumes
```

#### Check Import Queue Status

```bash
# View pending imports
docker exec -it miximixi-db psql -U postgres -d miximixi -c \
  "SELECT id, source_url, status, created_at FROM import_queue WHERE status = 'pending' ORDER BY created_at DESC LIMIT 10;"

# View failed imports
docker exec -it miximixi-db psql -U postgres -d miximixi -c \
  "SELECT id, source_url, error_msg, created_at FROM import_queue WHERE status = 'needs_review' ORDER BY created_at DESC LIMIT 10;"

# View completed recipes
docker exec -it miximixi-db psql -U postgres -d miximixi -c \
  "SELECT id, title, extraction_status, created_at FROM recipes ORDER BY created_at DESC LIMIT 10;"
```

### Weekly Maintenance

#### Database Backup

Automated daily backups are recommended. Manual backup:

```bash
# Create backups directory
mkdir -p ~/backups

# Backup database
docker exec miximixi-db pg_dump -U postgres miximixi \
  > ~/backups/miximixi_$(date +%Y%m%d_%H%M%S).sql

# Backup images
tar -czf ~/backups/recipe-images_$(date +%Y%m%d_%H%M%S).tar.gz \
  /var/lib/docker/volumes/miximixi_recipe-images/_data

# List backups
ls -lh ~/backups/
```

#### Clear Old Temporary Files

```bash
# Docker system prune (removes unused images/containers)
docker system prune -f

# Clear old logs (be careful with rotation)
journalctl --vacuum=7d
```

#### Review Security Updates

```bash
# Check if services have updates available
docker compose pull

# If updates found, rebuild and restart
docker compose up -d
```

### Monthly Operations

#### Refresh Certificates (if using Let's Encrypt)

Certbot auto-renews, but verify:

```bash
# Test renewal
sudo certbot renew --dry-run

# Check renewal dates
sudo certbot certificates

# View renewal log
sudo journalctl --unit=certbot --since today
```

#### Rotate Admin Passwords (n8n, Supabase)

```bash
# Generate new password
openssl rand -base64 16

# Update .env
nano .env
# Edit N8N_BASIC_AUTH_PASSWORD

# Restart n8n
docker compose restart n8n
```

#### Review Disk Usage & Plan Expansion

```bash
# Check main data partition
df -h /

# Check Docker volume usage
du -sh /var/lib/docker/volumes/*/

# If > 80% full, consider:
# 1. Archive old recipes to external storage
# 2. Add larger disk
# 3. Clean up old images: docker image prune -a --filter "until=720h"
```

---

### Disaster Recovery

#### Database Disaster (Corrupted/Lost Data)

```bash
# Stop all services
docker compose down

# Remove corrupted database volume (WARNING: destroys current data)
docker volume rm miximixi_db-data

# Start database service
docker compose up -d db

# Wait for DB to be ready
sleep 30

# Restore backup
docker exec -i miximixi-db psql -U postgres miximixi < ~/backups/miximixi_20260414.sql

# Verify restoration
docker exec -it miximixi-db psql -U postgres -d miximixi -c "SELECT COUNT(*) FROM recipes;"

# Restart all services
docker compose up -d
```

#### Image Storage Disaster

```bash
# If recipe images are lost or corrupted:

# Stop backend to prevent new writes
docker compose stop backend

# Restore images from backup
mkdir -p /var/lib/docker/volumes/miximixi_recipe-images/_data
tar -xzf ~/backups/recipe-images_20260414.tar.gz -C /var/lib/docker/volumes/miximixi_recipe-images/_data

# Restart backend
docker compose up -d backend
```

#### Full Server Failure (Hardware/Corruption)

**Assuming you've backed up `.env` and `~/backups/`:**

```bash
# On new server:
cd ~
git clone <repo-url> miximixi
cd miximixi

# Restore .env
cp ~/backup/.env .env

# Start stack
docker compose up -d

# Wait for database to start
sleep 30

# Restore database
docker exec -i miximixi-db psql -U postgres miximixi < ~/backup/miximixi_20260414.sql

# Restore images
mkdir -p /var/lib/docker/volumes/miximixi_recipe-images/_data
tar -xzf ~/backup/recipe-images_20260414.tar.gz -C /var/lib/docker/volumes/miximixi_recipe-images/_data

# Verify everything works
curl https://rezepte.example.com
curl https://api.rezepte.example.com/health
```

#### Service Won't Start (Dependency Issue)

```bash
# Check which service is failing
docker compose logs backend

# If database is down, start it first
docker compose up -d db
sleep 30

# Then start dependent services
docker compose up -d backend
docker compose up -d n8n

# Or fully restart
docker compose down
docker compose up -d
```

---

## Performance Tuning

### Optimize PostgreSQL for Recipe Workload

Edit `docker-compose.yml` db service section to add environment variables:

```yaml
db:
  image: postgres:15-alpine
  environment:
    POSTGRES_INITDB_ARGS: >
      -c max_connections=200
      -c shared_buffers=1GB
      -c effective_cache_size=3GB
      -c maintenance_work_mem=256MB
      -c work_mem=20MB
      -c max_wal_size=2GB
```

Then restart:
```bash
docker compose down
docker compose up -d db
```

### Add Database Indices

Accelerate queries on frequently filtered columns:

```bash
docker exec -it miximixi-db psql -U postgres -d miximixi << 'EOF'
CREATE INDEX idx_import_queue_status ON import_queue(status);
CREATE INDEX idx_recipes_extraction_status ON recipes(extraction_status);
CREATE INDEX idx_recipes_created_at ON recipes(created_at DESC);
CREATE INDEX idx_ingredients_recipe_id ON ingredients(recipe_id);
VACUUM ANALYZE;
EOF
```

### Enable Query Logging (for troubleshooting)

```bash
docker exec -it miximixi-db psql -U postgres -d miximixi << 'EOF'
ALTER SYSTEM SET log_min_duration_statement = 1000;  -- Log queries > 1s
ALTER SYSTEM SET log_statement = 'all';               -- Log all queries
SELECT pg_reload_conf();
EOF

# View logs
docker compose logs -f db | grep -i slow
```

### Optimize LLM Extraction

**Recommended: Use cloud LLM (Gemini/Claude)**
- Fastest extraction (3-5 seconds per recipe)
- No local resource usage
- Costs $0.003-0.10 per recipe
- No model download needed

**If using local Ollama:**

```bash
# Verify Ollama is running
docker compose ps ollama

# Run only one recipe at a time (single CPU queue)
# Parallel requests will queue behind each other

# Monitor inference queue
docker exec -it miximixi-ollama ollama list
docker exec -it miximixi-ollama ps

# If slow, switch to smaller model
docker exec -it miximixi-ollama ollama pull gemma3n:e4b  # Faster than llama3.2-vision

# Check CPU/memory usage
docker stats miximixi-ollama

# Tip: If CPU is consistently >80%, consider switching to cloud LLM
```

---

## Troubleshooting Production Issues

### "Connection refused" when accessing services

**Symptom:** `curl: (7) Failed to connect`

**Cause:** Service not running or firewall blocking

**Solution:**
```bash
# Check service status
docker compose ps

# If down, restart
docker compose up -d servicename

# Check firewall
sudo ufw status
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
```

### "Disk space full" error

**Symptom:** `No space left on device` in logs

**Cause:** Database or uploads filling disk

**Solution:**
```bash
# Find large items
du -sh /var/lib/docker/volumes/*/

# Clean up old Docker images
docker image prune -a

# Archive old recipes
docker exec -it miximixi-supabase-db pg_dump ... > archive.sql

# Delete old uploads
find /var/lib/docker/volumes/storage-volume/_data -type f -mtime +180 -delete
```

### PostgreSQL won't start (permission error)

**Symptom:** `postgres: FATAL: could not open file "/var/lib/postgresql/data/base/1/1247"`

**Cause:** Corrupted database or volume permission issue

**Solution:**
```bash
# Check volume status
docker volume ls | grep db-data

# Reset volume (WARNING: loses data if not backed up)
docker volume rm miximixi_db-data

# Restart
docker compose up -d db

# Restore from backup
docker exec -i miximixi-db psql -U postgres miximixi < backup.sql
```

### Ollama model keeps redownloading (if using Ollama)

**Symptom:** Each request redownloads model (slow extraction)

**Cause:** Volume not persisting or incorrect model name

**Solution:**
```bash
# Check volume exists
docker volume ls | grep ollama

# Verify model is loaded
docker exec -it miximixi-ollama ollama list

# If missing, pull again
docker exec -it miximixi-ollama ollama pull gemma3n:e4b

# Check model storage
docker exec -it miximixi-ollama ls -la /root/.ollama/models/
```

**Better solution: Switch to cloud LLM**
```bash
# Update .env
LLM_PROVIDER=gemini
GEMINI_API_KEY=AIza...

# Restart backend
docker compose restart backend

# Optional: Stop Ollama to free up RAM
docker compose stop ollama
```

### n8n webhook not receiving Telegram messages

**Symptom:** Telegram bot sends message, n8n workflow doesn't trigger

**Cause:** Webhook URL not reachable externally, or bot webhook not configured

**Solution:**
```bash
# 1. Test n8n is accessible
curl https://n8n.rezepte.example.com

# 2. In n8n, create a new Webhook node:
#    URL: https://n8n.rezepte.example.com/webhook/telegram
#    Method: POST

# 3. Configure Telegram bot webhook
curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook \
  -F url=https://n8n.rezepte.example.com/webhook/telegram \
  -F allowed_updates='["message"]'

# 4. Verify webhook is set
curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo
```

---

## Scaling Recommendations

### Scale to Multiple Recipes/Day

**Current capacity:**
- Cloud LLM (Gemini/Claude): 100+ recipes/day
- CPU Ollama: 10-20 recipes/day

**Recommended approach: Use cloud LLM provider**

1. **Switch to cloud LLM** (Gemini or Claude recommended for production)
   - 100+ recipes/day capacity
   - Cost: $0.003-0.10 per recipe
   - Implementation: Set `LLM_PROVIDER=gemini` or `LLM_PROVIDER=claude`
   - Can disable Ollama service entirely (saves 8GB RAM)
   - Fast extraction: 3-5 seconds per recipe

2. **Add backend load balancing** (if needed)
   ```yaml
   # docker-compose.yml
   backend:
     deploy:
       replicas: 3  # Run 3 backend instances
   ```

3. **Add Redis caching**
   ```yaml
   redis:
     image: redis:7-alpine
     ports:
       - "6379:6379"
   ```

4. **Enable Supabase replication** (if using managed Supabase cloud)

### Scale to Multiple Users (Multi-Tenant)

**Add user authentication and isolation:**

1. Add JWT token validation in backend (FastAPI middleware)
2. Add `created_by` foreign key to recipes table:
   ```sql
   ALTER TABLE recipes ADD COLUMN created_by UUID REFERENCES users(id);
   ```

3. Update backend endpoints to enforce user isolation:
   ```python
   # In each endpoint, check:
   # SELECT * FROM recipes WHERE id = %s AND created_by = current_user_id
   ```

4. Add user registration/login endpoints to backend

5. Deploy multi-instance backend with load balancer:
   ```yaml
   backend:
     deploy:
       replicas: 3  # Run 3 backend instances
   ```

6. Add Redis for session caching (optional):
   ```yaml
   redis:
     image: redis:7-alpine
     ports:
       - "6379:6379"
   ```

---

## Monitoring & Alerts

### Basic Health Checks (via cron)

```bash
#!/bin/bash
# Check every 5 minutes
* * * * * /opt/miximixi/scripts/health-check.sh

# Health check script:
#!/bin/bash
set -e

HEALTH_LOG="/var/log/miximixi-health.log"

echo "[$(date)] Starting health check..." >> $HEALTH_LOG

# Check services
docker compose ps | grep -q "healthy\|Up" || {
  echo "[$(date)] ERROR: Service unhealthy" >> $HEALTH_LOG
  # Send alert email/Telegram here
  exit 1
}

# Check disk space
DISK_USAGE=$(df /var/lib/docker | awk 'NR==2 {print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 80 ]; then
  echo "[$(date)] WARNING: Disk usage $DISK_USAGE%" >> $HEALTH_LOG
fi

echo "[$(date)] Health check OK" >> $HEALTH_LOG
```

### Monitoring Tools (Optional)

- **Prometheus + Grafana:** Metrics collection and visualization
- **Loki:** Log aggregation
- **Uptime Kuma:** External monitoring + status page

Setup is beyond this scope but recommended for production.

---

## Backup Strategy

### Automated Daily Backups

Create `scripts/backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/home/miximixi/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Database backup
docker exec miximixi-db pg_dump -U postgres miximixi \
  | gzip > "$BACKUP_DIR/database.sql.gz"

# Recipe images backup
tar -czf "$BACKUP_DIR/recipe-images.tar.gz" \
  /var/lib/docker/volumes/miximixi_recipe-images/_data

# Backup .env file (for disaster recovery)
cp /home/miximixi/miximixi/.env "$BACKUP_DIR/.env"

# Compress everything together
tar -czf "/home/miximixi/backups/miximixi_full_$(date +%Y%m%d_%H%M%S).tar.gz" \
  -C "/home/miximixi/backups" "$(basename $BACKUP_DIR)"

# Clean up temp directory
rm -rf "$BACKUP_DIR"

# Keep only last 30 days of backups
find /home/miximixi/backups -maxdepth 1 -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: $(date)" >> /var/log/miximixi-backup.log
```

Make executable and add to crontab:
```bash
chmod +x scripts/backup.sh

crontab -e
# Add: 0 3 * * * /home/miximixi/scripts/backup.sh
```

### Offsite Backup (Recommended)

```bash
# Upload to S3 or similar
aws s3 sync /home/miximixi/backups s3://my-backup-bucket/miximixi/ \
  --delete --storage-class GLACIER

# Or rsync to NAS
rsync -av /home/miximixi/backups/ user@nas:/backups/miximixi/
```

---

## Security Hardening

### Firewall Configuration

```bash
# Allow only necessary ports
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# Limit SSH connections
sudo ufw limit 22/tcp
```

### Docker Security

```bash
# Run services as non-root
docker exec miximixi-backend whoami
# Should output: app (not root)

# Enable security options in docker-compose.yml
services:
  backend:
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs: /tmp
```

### Database Access Control

```bash
# Create restricted database role for backend (optional)
docker exec -it miximixi-db psql -U postgres << 'EOF'
-- Create role for backend application
CREATE ROLE app_user WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE miximixi TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
EOF

# Update backend to use app_user instead of postgres (optional, for least privilege)
# Edit docker-compose.yml backend environment: DB_USER=app_user
```

### Environment Secrets

```bash
# Don't commit .env to Git
echo ".env" >> .gitignore
git rm --cached .env

# Use secrets manager for production
# docker compose --file docker-compose.prod.yml up
# (Reference .env file with --env-file flag in production)
```

---

## Cost Estimation (Monthly)

Assuming home server with electric cost $0.12/kWh:

| Component | Power | Monthly Cost |
|-----------|-------|--------------|
| Server (4 cores, 24/7) | 150W | $26 |
| Network/bandwidth | - | $10-50 (ISP dependent) |
| Gemini API (100 recipes) | - | $3 |
| **Total** | | **$40-80** |

If using CPU Ollama (no API calls): **$36-60/month**  
If using cloud LLM (Gemini/Claude): **$40-100/month** (plus API costs for extraction)

---

## Maintenance Schedule

| Task | Frequency | Time |
|------|-----------|------|
| Check service health | Daily | 5 min |
| Review logs for errors | Daily | 10 min |
| Database backup | Daily | Auto (5 min) |
| Disk space check | Weekly | 5 min |
| Security updates | Weekly | 30 min |
| Certificate renewal | Monthly | Auto (5 min) |
| Full system test | Monthly | 1 hour |
| Disaster recovery test | Quarterly | 2 hours |

---

## Next Steps

1. **Complete initial setup:** Follow "Initial Setup" section above
2. **Configure monitoring:** Set up health checks + alerts
3. **Test backups:** Verify restore procedure works
4. **Document customizations:** Update this guide with any custom config
5. **Plan scaling:** Identify when to add load balancing/multi-instance setup

---

**Last updated:** 2026-04-14  
**Migration note:** This guide has been updated to use plain PostgreSQL instead of Supabase. Key changes: direct psycopg2 connections instead of REST API, local filesystem image storage instead of Supabase Storage, and application-level permission checking instead of row-level security.  
**Related docs:** [`docs/deployment-local.md`](deployment-local.md) | [`docs/architecture.md`](architecture.md) | [`docs/QUICK-START.md`](QUICK-START.md)
