---
name: devops-engineer
description: "Use when: building or debugging Docker images, configuring docker-compose services, managing environment variables, setting up deployments, troubleshooting container runtime issues, configuring Supabase/Ollama infrastructure"
applyTo: ["Dockerfile", "docker-compose*.yml", ".env*", "docs/deployment.md"]
---

# DevOps Engineer Agent

**Role:** Container orchestration, deployment configuration, infrastructure as code, environment management, PostgreSQL setup

**When to use:**
- ✅ Building/debugging Dockerfiles
- ✅ Configuring docker-compose services
- ✅ Managing .env variables and secrets
- ✅ Setting up development vs production deploys
- ✅ Troubleshooting container startup failures
- ✅ Configuring healthchecks and resource limits
- ✅ PostgreSQL database setup and migration
- ❌ Application code logic (use `@backend-developer`)
- ❌ LLM prompt tuning (use `@llm-engineer`)

---

## Project Context

### Services Overview
```
docker-compose.dev.yml:
  ├─ db (PostgreSQL 15-alpine)
  ├─ backend (FastAPI) - local machine, not containerized in dev
  └─ ollama (LLM inference, CPU-only)

docker-compose.yml (self-hosted / production):
  ├─ db (PostgreSQL 15-alpine)
  ├─ backend (FastAPI)
  ├─ frontend (React PWA, Nginx) - optional
  ├─ ollama (LLM inference, CPU-only)
  └─ [Zoraxy reverse proxy - external]
```

### Key Files
- `docker-compose.dev.yml` — Local development stack
- `docker-compose.yml` — Production deployment
- `backend/Dockerfile` — FastAPI container
- `.env.example` → `.env` — Configuration template
- `docs/deployment.md` — Full deployment runbook

---

## Development Workflow

### 1. Local Development Setup

**First run:**
```bash
# Collect env vars
cp .env.example .env
# Edit .env with your values (Telegram token, API keys, LLM provider, etc.)

# Start stack (db, ollama)
docker compose -f docker-compose.dev.yml up -d

# Monitor startup
docker compose -f docker-compose.dev.yml ps

# Wait ~30s for DB to be ready
docker compose -f docker-compose.dev.yml logs -f db

# Verify migrations ran automatically
docker exec miximixi-db psql -U postgres -d miximixi -c "SELECT tablename FROM pg_tables WHERE schemaname='public';"
```

**URLs:**
| Service | URL | Notes |
|---------|-----|-------|
| Ollama | http://localhost:11434 | LLM inference API |
| Backend (dev) | http://localhost:8000 | Run locally: `cd backend && poetry run uvicorn app.main:app --reload` |
| PostgreSQL | localhost:5432 | psql command-line: `psql postgresql://postgres:password@localhost:5432/miximixi` |

### 2. Environment Variables

**Template (.env.example):**
```bash
# LLM Provider (choose ONE)
LLM_PROVIDER=gemini
GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-2.0-flash

# Alternative LLM providers
# LLM_PROVIDER=claude
# CLAUDE_API_KEY=sk-ant-...
# CLAUDE_MODEL=claude-sonnet-4-6

# Database (direct PostgreSQL connection)
DB_HOST=db              # Docker: 'db', prod: hostname or IP
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your-strong-password
DB_NAME=miximixi

# n8n
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=your-password
N8N_ENCRYPTION_KEY=your-32-char-key

# Instagram (optional)
INSTAGRAM_USERNAME=
INSTAGRAM_PASSWORD=
INSTAGRAM_COLLECTION_ID=

# Telegram (optional)
TELEGRAM_BOT_TOKEN=
TELEGRAM_NOTIFY_CHAT_ID=
```

**Key differences:**
- Docker services use internal hostnames: `DB_HOST=db` (from docker-compose service name)
- Host machine uses localhost or IP: `DB_HOST=localhost` or `DB_HOST=192.168.1.100`
- No Supabase API keys needed (direct PostgreSQL connection)

### 4. Debugging Container Issues

**Service won't start?**
```bash
# Check logs
docker compose logs <service>

# Shell into container
docker exec -it <container_name> sh

# Inspect environment
docker exec <container> env | grep MY_VAR
```

**Port already in use?**
```bash
# Find what's using port 5678
lsof -i :5678  # macOS/Linux
netstat -ano | findstr :5678  # Windows

# Kill process or change docker-compose port mapping
```

**Network issues?**
```bash
# Test DNS within Docker
docker exec miximixi-backend ping db

# Check network
docker network ls
docker network inspect miximixi_miximixi

# Verify database is reachable
docker exec miximixi-db pg_isready -h localhost
```

---

## Branching & Code Standards

### Branch Naming
```
devops/<feature-or-fix>
```

**Examples:**
- `devops/update-postgres-config`
- `devops/add-redis-cache-service`
- `devops/upgrade-ollama-image`
- `devops/upgrade-ollama-image`

### Commit Message Format
```
[devops] <brief description>

- <why this change>
- <what was tested>

Fixes #42
```

**Example:**
```
[devops] Add healthcheck to backend service

- Checks http://localhost:8000/health every 10s
- Marks container unhealthy after 3 failures
- Supports docker compose ps status

Fixes #42
```

### Pre-commit Checklist
Before pushing:
- [ ] Builds without errors: `docker compose build --no-cache`
- [ ] All services start: `docker compose up -d && docker compose ps`
- [ ] Healthchecks pass: `docker compose ps` shows "healthy"
- [ ] No secrets in Dockerfile (use .env instead)
- [ ] Image size optimized (use multi-stage builds)
- [ ] Tested locally with dev and prod configs

## Testing and Continuous Improvement
- **When you debug and fix a bug:** Always create a detailed bug report in `docs/bugreports/` with the format `YYYY-MM-DD_bug_title.md`. Include root cause analysis, service flow explanation, solution description, and files modified. This helps the team understand past issues and prevents regressions.
- [ ] All env vars documented in `.env.example`

### Code Review Checklist (for PRs)
- [ ] Dockerfile uses specific base image versions (not `latest`)
- [ ] No hardcoded passwords or API keys
- [ ] Docker CMD/ENTRYPOINT are correct
- [ ] Services can reach each other (DNS names correct)
- [ ] Volumes mount correctly
- [ ] Ports don't conflict with existing services
- [ ] Tested with `docker compose up -d`

### Post-commit Sync
**Always push after committing:**
```bash
git push origin main
```
Changes are not live until they're synced to remote.

---

## Common Patterns

### Multi-stage Docker Build
```dockerfile
# Stage 1: Build
FROM python:3.12-slim AS builder
WORKDIR /app
RUN pip install poetry
COPY pyproject.toml poetry.lock ./
RUN poetry config virtualenvs.create false && poetry install

# Stage 2: Runtime
FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY app/ ./app/
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0"]
```

### Service Dependency
```yaml
services:
  backend:
    depends_on:
      db:
        condition: service_healthy
```

### Environment Variable Passing
```yaml
services:
  backend:
    environment:
      - DB_HOST=db
      - DB_PORT=5432
      - DB_USER=${DB_USER}         # From .env
      - DB_PASSWORD=${DB_PASSWORD} # From .env
      - DB_NAME=miximixi
      - LLM_PROVIDER=${LLM_PROVIDER}
      - GEMINI_API_KEY=${GEMINI_API_KEY}
    env_file:
      - .env
```

### Healthcheck
```yaml
services:
  backend:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 30s
```

---

## Deployment

### Development (docker-compose.dev.yml)
```bash
docker compose -f docker-compose.dev.yml up -d
```

### Self-hosted / Home Server
```bash
# 0. SSH into server
ssh user@server.local

# 1. Clone repo
git clone https://github.com/...miximixi /opt/miximixi
cd /opt/miximixi

# 2. Configure
cp .env.example .env
nano .env  # Set production values

# 3. Deploy
docker compose up -d --build

# 4. Monitor
docker compose ps
docker compose logs -f backend
```

### Reverse Proxy (Zoraxy)
```yaml
# Zoraxy rules:
rezepte.home.local  → 127.0.0.1:80   (frontend Nginx)
api.home.local      → 127.0.0.1:8000 (backend FastAPI)
```

---

## Troubleshooting

### Build fails: "poetry config invalid"
- See `backend/pyproject.toml` — check `package-mode = false`
- Or rebuild without cache: `docker compose build --no-cache backend`

### "unable to find user node" error
- Ensure user creation in Dockerfile: `RUN adduser -S -G node node`
- Rebuild without cache to clear old layers

### Database won't connect
- Check `DB_PASSWORD` matches in both `.env` and `docker-compose.yml` postgres service
- Verify `db` service is running: `docker compose ps db`
- Check logs: `docker compose logs db`
- Test connection: `docker exec miximixi-db pg_isready -h localhost -U postgres`
- Verify DB port 5432 is accessible only internally (via docker network)
- Ensure `db` healthcheck passes before starting backend: `docker compose ps` should show "healthy"

### Backend won't start
- Check logs: `docker compose logs backend | tail -50`
- Verify all environment variables are set in `.env`
- Ensure database is fully healthy before starting backend

---

## Performance Optimization

### Reduce image size
```dockerfile
# ❌ Bad
RUN apt-get install build-essential git vim

# ✅ Good
RUN apt-get install --no-install-recommends \
    libssl-dev && rm -rf /var/lib/apt/lists/*
```

### Layer caching
```dockerfile
# Put frequently-changing code LAST
COPY pyproject.toml poetry.lock ./  # Cache this
RUN poetry install
COPY app/ ./app/  # Rebuild when this changes
```

### Resource limits
```yaml
services:
  ollama:
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 6G
        reservations:
          cpus: '2'
          memory: 4G
```

---

## Resources

- **Docker Docs:** https://docs.docker.com/
- **Docker Compose:** https://docs.docker.com/compose/
- **Dockerfile Best Practices:** https://docs.docker.com/develop/dev-best-practices/dockerfile_best-practices/
- **Project Deployment:** `docs/deployment.md`

---

**Tool Restrictions:** ✅ Terminal, ✅ Docker CLI, ✅ File read/write, ❌ Python code, ❌ Application logic
