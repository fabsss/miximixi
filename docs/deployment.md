# Miximixi – Deployment Guide (Overview)

Quick reference for deploying Miximixi. Choose your deployment target below for detailed setup instructions.

---

## 🚀 Quick Start

### Local Development (Windows 11 / WSL2 / macOS / Linux)

**→ [Full Local Setup Guide](deployment-local.md)**

**Best for:** Rapid iteration, testing features, learning the codebase

**Prerequisites:**
- Docker Desktop
- Node.js 20+, Python 3.12+, Poetry
- ~5 GB disk space
- 30-60 minutes

**Quick summary:**
```bash
git clone <repo> ~/git/miximixi
cd ~/git/miximixi
cp .env.example .env
# Edit .env (add Gemini API key for fastest setup)
docker compose -f docker-compose.dev.yml up -d
cd backend && poetry install && poetry run uvicorn app.main:app --reload --port 8000
```

**Access points:**
| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:8000 |
| Swagger API docs | http://localhost:8000/docs |
| Supabase Studio | http://localhost:54323 |
| Ollama | http://localhost:11434 |

---

### Production Deployment (Home Server / VPS)

**→ [Full Production Setup Guide](deployment-production.md)**

**Best for:** Self-hosted, privacy-first, long-term operation

**Prerequisites:**
- Linux server (Ubuntu 22.04+ recommended) or Windows Server with Docker
- 16 GB RAM, 4+ CPU cores, 50 GB storage
- Static IP or stable domain name
- 2-3 hours for initial setup

**Quick summary:**
```bash
git clone <repo> /opt/miximixi
cd /opt/miximixi
cp .env.example .env
# Edit .env with strong passwords and Gemini/Claude API keys
docker compose up -d
# Configure reverse proxy (Zoraxy/Traefik/nginx)
# Set up backups and monitoring
```

**Service endpoints (via reverse proxy):**
| Service | Subdomain |
|---------|-----------|
| Frontend (React PWA) | rezepte.example.com |
| Backend API | api.rezepte.example.com |
| n8n Workflows | n8n.rezepte.example.com |
| Database Admin | db.rezepte.example.com |

---

## Architecture Overview

### Component Stack

```
Frontend (React PWA)
    ↓ HTTPS
Backend (FastAPI) ←→ Supabase Database (PostgreSQL)
    ↓                      ↓
LLM Provider            PostgREST API
(Gemini/Claude/Ollama)     ↓
                      Row-Level Security
    
Additional:
    n8n: Webhook automation (Telegram/Instagram)
    Ollama: Local LLM runtime (optional)
    Zoraxy: Reverse proxy & HTTPS termination
```

### Storage & Data Flow

```
Instagram/YouTube/Website URL
    ↓
yt-dlp (Instagram/YouTube) OR Playwright (Website)
    ↓
Media Files (MP4, JPG, PNG)
    ↓
LLM Extraction (Gemini/Claude/Ollama)
    ↓
Recipe JSON + Image
    ↓
PostgreSQL Database + Supabase Storage
    ↓
React Frontend (Display)
```

---

## LLM Provider Comparison

Choose the best provider for your use case:

| Provider | Speed | Cost | Setup | Notes |
|----------|-------|------|-------|-------|
| **Gemini 2.0 Flash** (Cloud) | ⚡ 3-5s | Free (50/day) | 5 min | **Recommended for dev** |
| **Claude 3.5** (Cloud) | ⚡ 5-10s | $0.003/recipe | 5 min | Best extraction quality |
| **Ollama + Gemma3n** (Local) | 🐢 2-5 min | Free | 30 min | Privacy-first, requires 8-12GB VRAM |
| **Ollama + Llama 3.2** (Local) | 🐢 3-10 min | Free | 30 min | Lower quality, more CPU intensive |

**For development:** Use Gemini (instant, no setup)  
**For production:** Use Claude (highest quality) or Gemini (fast + cheap)  
**For privacy:** Use Ollama + Gemma3n (fully local)

---

## Key Differences: Local vs. Production

| Aspect | Local Dev | Production |
|--------|-----------|------------|
| **OS** | Windows/macOS/Linux | Linux (Ubuntu 22.04+) |
| **Docker Compose** | `docker-compose.dev.yml` | `docker-compose.yml` |
| **Backend Runtime** | Local Python (uvicorn --reload) | Containerized (Docker) |
| **Database** | Supabase container | Supabase container |
| **HTTPS/TLS** | Not configured (HTTP only) | Required (Let's Encrypt/Zoraxy) |
| **Reverse Proxy** | nginx (simple) | Zoraxy/Traefik (with SSL) |
| **Backups** | Manual | Automated daily |
| **Monitoring** | Manual logs | Health checks + alerts |
| **Secrets** | `.env` file (version control ok) | `.env` file (NOT in version control) |
| **Scale** | Single instance | Can scale to multiple instances |

---

## Common Setup Questions

### "What's the fastest way to test locally?"

1. Get a free Gemini API key: https://aistudio.google.com/apikey
2. Follow [Local Setup Guide](deployment-local.md) (30 min total)
3. Use Postman/curl to test `/import` endpoint

### "Can I run this on Windows 11?"

Yes, use WSL2 with Docker Desktop. Follow [Local Setup Guide](deployment-local.md).

### "How much does it cost to run monthly?"

- **Gemini API only:** $3-10/month (100-300 imports)
- **Home server (electricity):** $30-50/month
- **Total:** $35-60/month (or less with free tiers)

### "Can I self-host everything locally?"

Yes. Use Ollama + Gemma3n model (free, no API calls). Requires:
- 8-12 GB RAM (for LLM)
- 4+ CPU cores
- ~10 min wait per recipe (CPU inference)

See [Production Guide](deployment-production.md) for full setup.

### "How do I set up Instagram automation?"

Use n8n workflows (included in repo):
1. Deploy stack
2. Open n8n UI
3. Import `n8n/instagram_poller.json`
4. Configure with your Instagram credentials

See [Production Guide](deployment-production.md) → n8n section.

### "What if I want to add more features?"

1. Read [Architecture Docs](architecture.md) for codebase overview
2. Follow contribution guidelines in [CLAUDE.md](../CLAUDE.md)
3. Test locally with dev setup
4. Deploy to production when ready

---

## Troubleshooting

### "My imports are slow"

**Cause:** Using Ollama (CPU inference)  
**Solution:** Switch to Gemini/Claude API (5-10x faster)
```bash
LLM_PROVIDER=gemini poetry run uvicorn app.main:app --reload
```

### "Docker services won't start"

**Solution:** Restart Docker, check logs:
```bash
docker compose logs supabase-db
docker compose up -d  # Try again
```

### "I can't access the API on production"

**Solution:** Check firewall and reverse proxy config
```bash
curl https://api.rezepte.example.com/health
# If fails, check Zoraxy/nginx logs
```

### "Database migration failed"

**Solution:** Run migrations manually:
```bash
docker exec -it miximixi-supabase-db psql -U postgres -d postgres \
  -f /docker-entrypoint-initdb.d/001_initial.sql
```

**For more troubleshooting:** See detailed guides:
- [Local Dev Troubleshooting](deployment-local.md#troubleshooting)
- [Production Troubleshooting](deployment-production.md#troubleshooting-production-issues)

---

## Next Steps

### For Local Development
1. Read [deployment-local.md](deployment-local.md) fully
2. Complete setup (should take 30-60 min)
3. Test with `curl http://localhost:8000/health`
4. Import a recipe to verify end-to-end flow

### For Production Deployment
1. Read [deployment-production.md](deployment-production.md) fully
2. Plan your infrastructure (server specs, domain, LLM provider)
3. Complete setup (should take 2-3 hours)
4. Test importing recipes from Telegram bot
5. Set up automated backups
6. Configure monitoring & alerts

### For Feature Development
1. Read [architecture.md](architecture.md)
2. Review [CLAUDE.md](../CLAUDE.md) for development workflow
3. Follow test guidelines in [testing-guide.md](testing-guide.md)
4. Create feature branch and submit PR

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [deployment-local.md](deployment-local.md) | Complete local dev setup guide |
| [deployment-production.md](deployment-production.md) | Complete production deployment guide |
| [architecture.md](architecture.md) | System architecture & codebase overview |
| [QUICK-START.md](QUICK-START.md) | 5-minute quick start for testing |
| [testing-guide.md](testing-guide.md) | How to write and run tests |
| [plan.md](plan.md) | Project roadmap & feature plans |

---

## Support

- **Local dev issues:** See [deployment-local.md troubleshooting](deployment-local.md#troubleshooting)
- **Production issues:** See [deployment-production.md troubleshooting](deployment-production.md#troubleshooting-production-issues)
- **Architecture questions:** Read [architecture.md](architecture.md)
- **Bugs/Features:** Check [GitHub Issues](https://github.com/username/miximixi/issues)

---

**Last updated:** 2026-04-14
