# 🍳 Miximixi – Smart Recipe Capture & Management

A full-stack web application for importing, extracting, and organizing recipes from any source: Instagram, YouTube, websites, or plain text. Powered by LLMs (Google Gemini, Claude, or local Ollama) and built with React + FastAPI + PostgreSQL.

## 🎯 What It Does

**Import recipes from anywhere:**
- 📱 Instagram posts & stories (via yt-dlp)
- 🎬 YouTube videos (with keyframe extraction)
- 🌐 Websites (screenshot + HTML parsing)
- 💬 Plain text descriptions (paste and import)

**Automatically extract structured data:**
- Recipe title, servings, cook time
- Ingredients list with quantities
- Step-by-step instructions with media
- Categories, tags, cuisine type
- High-quality cover images

**Organize & cook:**
- Full-text search across recipes
- Filter by cuisine, cook time, difficulty
- Cook mode with timer overlay
- Print-friendly instructions
- Mobile-optimized PWA

---

## 🚀 Quick Start

### Prerequisites
- **Docker & Docker Compose** (development & production)
- **Python 3.12** (local development only)
- **Node 20** (local development only)
- API keys (optional): Google Gemini, Claude, or none if using local Ollama

### 1. Clone & Configure

```bash
git clone <repo> ~/git/miximixi
cd ~/git/miximixi
cp .env.example .env
```

Edit `.env` with your preferences:
```bash
# Required: Choose one LLM
LLM_PROVIDER=gemini              # Options: gemini, claude, openai, ollama
GOOGLE_API_KEY=your-key-here     # If using Gemini (get from Google Cloud)
CLAUDE_API_KEY=your-key-here     # If using Claude
OPENAI_API_KEY=your-key-here     # If using OpenAI

# Optional: Telegram Bot (for importing via Telegram)
TELEGRAM_BOT_TOKEN=your-token    # Get from @BotFather

# Database (defaults work for local dev)
DB_HOST=localhost
DB_PORT=5432
DB_USER=miximixi
DB_PASSWORD=miximixi
DB_NAME=miximixi_test
```

### 2. Start Docker Services

**Development (with live reloading):**
```bash
docker compose -f docker-compose.dev.yml up -d
```

**Production:**
```bash
docker compose up -d
```

Services start:
- 🔵 **Backend API** → http://localhost:8000
- 🎨 **Frontend** → http://localhost:5173 (dev) or http://localhost:3000 (prod)
- 🐘 **PostgreSQL** → localhost:5432
- 🧠 **Ollama** (optional) → http://localhost:11434

### 3. Verify Everything Works

```bash
# Check backend health
curl http://localhost:8000/health

# Check frontend
open http://localhost:5173  # or :3000 for prod

# View logs
docker compose logs -f backend   # Backend logs
docker compose logs -f frontend  # Frontend logs
```

### 4. Import Your First Recipe

**Option A: Via HTTP API**
```bash
curl -X POST http://localhost:8000/import \
  -H "Content-Type: application/json" \
  -d '{
    "source_url": "https://www.instagram.com/p/ABC123XYZ/",
    "raw_text": "Optional: Recipe text if available"
  }'
```

**Option B: Via Frontend**
1. Open http://localhost:5173
2. Click "Import Recipe" → paste a URL
3. Wait for extraction (10–30 seconds depending on LLM)

---

## 📁 Project Structure

```
miximixi/
├── backend/                    # FastAPI Python application
│   ├── app/
│   │   ├── main.py            # API endpoints
│   │   ├── queue_worker.py    # Async job processing (LLM extraction)
│   │   ├── llm_provider.py    # LLM abstraction (Gemini/Claude/Ollama)
│   │   ├── models.py          # SQLAlchemy ORM models
│   │   ├── config.py          # Configuration & settings
│   │   └── media_processor.py # ffmpeg, image processing
│   ├── migrations/             # PostgreSQL schema migrations
│   ├── tests/
│   │   ├── unit/              # Unit tests
│   │   └── functional/        # Integration tests
│   ├── pyproject.toml         # Python dependencies (Poetry)
│   ├── Dockerfile             # Docker image
│   └── start.sh               # Entrypoint
│
├── frontend/                   # React + TypeScript (Vite)
│   ├── src/
│   │   ├── components/        # React components
│   │   │   ├── FeedPage.tsx
│   │   │   ├── RecipeDetail.tsx
│   │   │   ├── ImportForm.tsx
│   │   │   ├── TimerOverlay.tsx
│   │   │   └── ...
│   │   ├── context/           # React Context (state management)
│   │   │   ├── TimerContext.tsx
│   │   │   ├── ThemeContext.tsx
│   │   │   └── ...
│   │   ├── pages/             # Page components
│   │   ├── lib/               # Utilities
│   │   │   ├── api.ts         # HTTP client
│   │   │   ├── theme.ts       # Theme system
│   │   │   └── ...
│   │   ├── styles/            # Global CSS
│   │   ├── App.tsx            # Root component
│   │   └── main.tsx           # Entrypoint
│   ├── package.json           # npm dependencies
│   ├── tsconfig.json          # TypeScript config
│   ├── vite.config.ts         # Vite config
│   ├── Dockerfile             # Docker image
│   └── nginx.conf             # Production web server
│
├── docs/                       # Documentation
│   ├── QUICK-START.md         # Quick reference
│   ├── architecture.md        # Technical architecture
│   ├── testing-guide.md       # How to test the app
│   ├── design-system.md       # UI/UX guidelines
│   ├── deployment-local.md    # Local deployment
│   ├── deployment-production.md
│   └── ...
│
├── docker-compose.dev.yml     # Dev stack (hot reload)
├── docker-compose.yml         # Production stack
├── .env.example               # Environment template
├── .github/
│   ├── workflows/ci.yml       # GitHub Actions CI/CD
│   ├── agents/                # AI agent definitions
│   └── ...
│
└── README.md                  # This file
```

---

## 🏗️ Architecture

### Data Flow: From Link to Structured Recipe

```
User Input (URL)
    ↓
┌─ HTTP /import endpoint ──────┐
│                              │
│ 1. Validate URL              │
│ 2. Create queue job          │
│ 3. Return immediately        │
└──────────┬───────────────────┘
           ↓
    [Queue Worker - Async]
           ↓
    ┌──────────────────────────────────┐
    │ 1. Download media                │
    │    - Instagram: yt-dlp           │
    │    - YouTube: yt-dlp + ffmpeg    │
    │    - Website: Playwright         │
    │                                  │
    │ 2. Extract frames                │
    │    - Video → keyframes (ffmpeg)  │
    │    - Image → resize (PIL)        │
    │                                  │
    │ 3. Call LLM                      │
    │    - Send frames + text to API   │
    │    - Parse structured response   │
    │                                  │
    │ 4. Save to database              │
    │    - Recipe metadata             │
    │    - Ingredients + steps         │
    │    - Media files                 │
    └──────────┬───────────────────────┘
               ↓
        ✅ Recipe saved
           (Frontend polls for status)
```

### Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | React 18 + TypeScript + Vite | Type-safe, fast builds, PWA-ready |
| **Styling** | Tailwind CSS + CSS variables | Utility-first, dark mode support |
| **State** | React Context | Simple, built-in, no extra deps |
| **Backend** | FastAPI + Python 3.12 | Async, fast, simple, great docs |
| **Database** | PostgreSQL 15 | Reliable, JSONB support, full-text search |
| **ORM** | psycopg2 | Direct, parametrized, secure |
| **LLM** | Gemini 2.0 Flash / Claude / Ollama | Multi-modal, local option available |
| **Media** | ffmpeg + yt-dlp + Playwright | Industry standard tools |
| **Deployment** | Docker Compose | Portable, reproducible |
| **CI/CD** | GitHub Actions | Free, built-in |

---

## 🔧 Development Workflow

### Backend Development

**Install dependencies:**
```bash
cd backend
poetry install
```

**Run tests:**
```bash
poetry run pytest tests/ -v              # All tests
poetry run pytest tests/unit/ -v         # Unit only
poetry run pytest tests/functional/ -v   # Integration only
```

**Start backend (in Docker):**
```bash
docker compose -f docker-compose.dev.yml up backend
```

**Or run locally (requires PostgreSQL running):**
```bash
poetry run python -m app.main
```

**API Documentation (auto-generated):**
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### Frontend Development

**Install dependencies:**
```bash
cd frontend
npm install
```

**Start dev server (hot reload):**
```bash
npm run dev
```

Open http://localhost:5173

**Build for production:**
```bash
npm run build
npm run preview   # Test production build locally
```

**Linting & type checking:**
```bash
npm run lint      # ESLint
npx tsc --noEmit # TypeScript
npm run build     # Full build test
```

---

## 📋 Features

### ✅ Currently Working
- ✅ Recipe import from URLs (Instagram, YouTube, websites)
- ✅ LLM-powered extraction (Gemini, Claude, local Ollama)
- ✅ Queue-based processing (async, non-blocking)
- ✅ Image extraction and storage
- ✅ Database persistence
- ✅ Frontend recipe feed with filtering
- ✅ Recipe detail view with ingredients & steps
- ✅ Dark mode / Light mode
- ✅ Timer with overlay (step-by-step cooking)
- ✅ Mobile-responsive design (PWA-ready)
- ✅ Server-side search and filtering

### 🚧 In Progress
- 🚧 Deduplication system (same recipe from different sources)
- 🚧 Tag consolidation & management
- 🚧 Multi-language support

### 📅 Future (Not Started)
- User authentication & recipes per user
- Sharing & collaborative cookbooks
- Recipe ratings and comments
- Advanced filtering (dietary restrictions, ingredients on-hand)
- Recipe scaling (adjust servings)
- Grocery list generation
- Export to other formats (PDF, CSV)

---

## 🐛 Troubleshooting

### Backend won't start / Database error
```bash
# Check if PostgreSQL is running
docker compose ps

# View backend logs
docker compose logs backend

# Restart everything
docker compose down
docker compose up -d
```

### Tests failing locally
```bash
# Ensure test database exists
docker compose exec postgres psql -U miximixi -c "CREATE DATABASE miximixi_test;"

# Run migrations
cd backend
poetry run python -m app.db_init

# Then run tests
poetry run pytest tests/ -v
```

### LLM API errors
- **Gemini**: Check `GOOGLE_API_KEY` in `.env` and API is enabled in Google Cloud
- **Claude**: Check `CLAUDE_API_KEY` and you have API credits
- **Ollama**: Ensure `docker compose` includes Ollama service and model is downloaded
  ```bash
  docker compose exec ollama ollama pull llama2-vision
  ```

### Frontend won't load
- Check if backend is running: `curl http://localhost:8000/health`
- Check if frontend dev server is running: `npm run dev`
- Clear browser cache and reload

---

## 📚 Documentation

- **[QUICK-START.md](docs/QUICK-START.md)** — Quick reference & status
- **[architecture.md](docs/architecture.md)** — Technical deep dive
- **[testing-guide.md](docs/testing-guide.md)** — How to test features
- **[design-system.md](docs/design-system.md)** — UI/UX guidelines
- **[deployment-local.md](docs/deployment-local.md)** — Local development
- **[deployment-production.md](docs/deployment-production.md)** — Production setup
- **[CLAUDE.md](CLAUDE.md)** — Project guidelines for AI assistants

---

## 🔐 Security & Privacy

- **Database**: PostgreSQL with psycopg2 parametrized queries (prevents SQL injection)
- **API**: CORS configured, no authentication required (add in future)
- **Media**: Stored locally, not exposed to third parties
- **LLM calls**: Sent to configured providers only (Gemini, Claude, or local Ollama)
- **Secrets**: Use `.env` file (never commit secrets)

---

## 📦 Deployment

### Local (Development)
```bash
docker compose -f docker-compose.dev.yml up -d
```

### Production (Remote Server)
```bash
docker compose up -d
```

Configure reverse proxy (Zoraxy, nginx, etc.) to:
- Frontend: `example.com/`
- Backend API: `example.com/api/`

See [deployment-production.md](docs/deployment-production.md) for full details.

---

## 🤝 Contributing

### Branch Naming
```
<domain>/<feature-or-fix>
```
Examples: `backend/add-youtube-import`, `frontend/improve-timer-ui`

### Commit Message Format
```
[domain] Brief description

Longer explanation if needed.

Fixes #123
Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
```

### Pre-Commit Checks
Before committing:
```bash
# Backend
cd backend
poetry run pytest tests/ -v

# Frontend
cd frontend
npm run lint
npx tsc --noEmit
npm run build
```

### Code Review
- Use GitHub PRs
- Reference the issue being fixed
- Include testing instructions
- Check CI/CD passes before merging

---

## 📊 Project Status

| Component | Status | Notes |
|-----------|--------|-------|
| Backend API | ✅ Stable | All core endpoints working |
| Database | ✅ Stable | PostgreSQL migrations automated |
| Frontend | ✅ Stable | React feed, detail, timer working |
| LLM Integration | ✅ Working | Gemini, Claude, Ollama supported |
| Testing | ✅ Comprehensive | Unit + functional tests with 85%+ coverage |
| Deduplication | 🚧 In Progress | Shortcode-based system implemented |
| Multi-language | 🚧 Planned | Database schema ready |
| Authentication | 📅 Future | Not required for v1 |

---

## 📞 Getting Help

- **API Docs**: http://localhost:8000/docs (when running)
- **Issues**: Check GitHub issues for known problems
- **Logs**: `docker compose logs -f <service>` for service logs
- **Code**: See [CLAUDE.md](CLAUDE.md) for agent-based development

---

## 📝 License

[Add your license here]

---

## 🙏 Credits

Built with:
- **FastAPI** – Modern Python web framework
- **React** – JavaScript UI library
- **PostgreSQL** – Reliable database
- **Google Gemini** – LLM API
- **Vite** – Fast build tool
- **Tailwind CSS** – Utility-first styling

---

**Last updated:** April 2026  
**Maintained by:** Development Team
