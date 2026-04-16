# Miximixi Workspace Agents

Custom AI agents for specialized development roles in the Miximixi project. Each agent is optimized for a specific domain with curated tool access, documentation context, and branching workflows.

**Available in:** VS Code Copilot Chat (`@agent-name`) and Claude Code

---

## Agent Registry

### 1. Backend Developer
**File:** `backend-developer.agent.md`

**Use when:**
- Building/debugging FastAPI endpoints
- Working with database models and migrations
- Managing Python dependencies (Poetry)
- Implementing job queues and async tasks
- Writing LLM integration logic

**Domain focus:** `backend/app/`, `backend/pyproject.toml`, database schemas

**Example prompts:**
- `@backend-developer help me implement the /import endpoint`
- `@backend-developer what's wrong with my recipe extraction logic?`
- `@backend-developer add migration for new translations table`

---

### 2. DevOps Engineer
**File:** `devops-engineer.agent.md`

**Use when:**
- Building/debugging Docker images and compose files
- Configuring environment variables
- Setting up development vs production deployments
- Troubleshooting container runtime issues
- Managing Supabase and Ollama infrastructure

**Domain focus:** `Dockerfile`, `docker-compose.yml`, `.env`, `deployment.md`

**Example prompts:**
- `@devops-engineer why is the database failing to start?`
- `@devops-engineer help me set up SSL for the reverse proxy`
- `@devops-engineer configure healthchecks for all services`

---

### 3. LLM Engineer
**File:** `llm-engineer.agent.md`

**Use when:**
- Engineering prompts for recipe extraction
- Handling media processing (ffmpeg, yt-dlp)
- Testing LLM integrations (Gemini, Claude, Ollama)
- Optimizing token usage and response quality
- Debugging extraction failures

**Domain focus:** `backend/app/llm_provider.py`, `media_processor.py`, prompts, LLM configs

**Example prompts:**
- `@llm-engineer improve the recipe extraction prompt`
- `@llm-engineer why is Gemini failing on this Instagram video?`
- `@llm-engineer optimize ffmpeg keyframe extraction`

---

### 4. Frontend Developer
**File:** `frontend-developer.agent.md`

**Use when:**
- Building React components (pages, widgets)
- Styling with CSS/Tailwind CSS
- Managing state and API integration
- Handling forms and validation
- Responsive & mobile design
- Accessibility & performance optimization
- Debugging UI/browser issues

**Domain focus:** `frontend/src/`, components, styling, state management, API integration

**Example prompts:**
- `@frontend-developer help me build the recipe import form`
- `@frontend-developer make this grid responsive on mobile`
- `@frontend-developer optimize image loading performance`

---

### 5. Product Owner
**File:** `product-owner.agent.md`

**Use when:**
- Writing user stories and acceptance criteria
- Defining feature specifications and scope
- Planning sprints and prioritization
- Making architectural decisions
- Reviewing requirements and workflows
- Documenting design decisions

**Domain focus:** `docs/plan.md`, `docs/architecture.md`, requirements, roadmap, GitHub issues

**Example prompts:**
- `@product-owner help me write user stories for recipe translation feature`
- `@product-owner what's our roadmap for Q2?`
- `@product-owner review this feature spec for multi-language support`

---

### 5. QA Engineer
**File:** `qa-engineer.agent.md`

**Use when:**
- Writing test plans and test cases
- Designing tests for edge cases and boundaries
- Performance and load testing
- Regression testing strategy
- Bug reproduction and verification
- Test automation framework setup

**Domain focus:** `tests/`, performance metrics, test automation, quality assurance

**Example prompts:**
- `@qa-engineer create a test plan for Instagram recipe import`
- `@qa-engineer what edge cases should we test?`
- `@qa-engineer help me set up pytest for this feature`

---

## UI/Frontend Work

### Component & Selector Verification
When making UI/CSS changes, **always verify the exact component and selector being modified** by reading the file first. Never assume which element the user is referring to — grep for the specific text/class mentioned and confirm before editing.

**Pattern:**
1. User describes a UI change
2. Use Grep to find the exact component/class/text
3. Read the full component file
4. Confirm which file and line you'll edit
5. Show the user the current state BEFORE making changes
6. Only edit after confirmation

### Theme System: `data-theme` vs Tailwind `dark:`
This project uses `data-theme` attribute for theming, **NOT Tailwind's `dark:` class prefix**. Always check the actual theme implementation before modifying styles.

**How it works:**
- Light mode: `<html>` or `<html data-theme="light">`
- Dark mode: `<html data-theme="dark">`
- CSS variables like `--mx-primary` change based on `data-theme` attribute
- Do NOT use Tailwind's `dark:` prefix — it won't work

**When modifying styles:**
- Check if the change affects both light and dark modes
- Use CSS variables (`var(--mx-*)`) when possible
- If you need data-theme-specific rules, use: `[data-theme="dark"] .selector { ... }`
- Test changes in both light and dark modes before committing

---

## Branching & Code Review Workflow

All agents enforce these practices:

### Branch Naming
```
<agent-domain>/<feature-or-fix>
```

**Examples by agent:**
- `backend/add-recipe-translation-api`
- `devops/improve-postgres-healthcheck`
- `llm/improve-gemini-extraction-prompt`

### Commit Guidelines
Each agent reminds you to:
1. **Reference the issue**: `Fixes #42: Add recipe translation API`
2. **Include domain tag**: `[backend]`, `[devops]`, `[llm]`
3. **Keep commits small**: One feature per commit (easier to review)

### Code Review Checklist
When creating PRs, include:

**Backend PRs** (see `backend-developer.agent.md`):
- [ ] All new endpoints tested with curl/Postman
- [ ] Database migrations included
- [ ] Dependencies updated in pyproject.toml
- [ ] Error handling covers edge cases

**DevOps PRs** (see `devops-engineer.agent.md`):
- [ ] Docker image builds without warnings
- [ ] All env vars documented in `.env.example`
- [ ] Services pass healthchecks
- [ ] Tested locally with `docker compose up -d`

**LLM PRs** (see `llm-engineer.agent.md`):
- [ ] Prompt tested with 3+ different inputs
- [ ] Token usage within limits
- [ ] Fallback handling for API failures
- [ ] Extraction quality scores logged

---

## Pre-Commit Testing Requirements

**Before each commit, run the following checks locally to catch issues early:**

### Backend Tests & Linting
```bash
cd backend
poetry run pytest tests/ -v        # Run all tests
poetry run pytest --cov           # (Optional) Check coverage
```

**Required:** All tests must pass before committing.

### Frontend Linting & Type Checking
```bash
cd frontend
npm run lint                       # ESLint checks
npx tsc --noEmit                   # TypeScript compilation (no emit)
npm run build                      # Full build verification
```

**Required:** All linting errors and type errors must be resolved before committing.

### Pre-Commit Checklist
- [ ] Backend: `poetry run pytest tests/ -v` passes
- [ ] Frontend: `npm run lint` shows no errors
- [ ] Frontend: `npx tsc --noEmit` shows no type errors
- [ ] Frontend: `npm run build` completes successfully

**Why:** Local testing prevents broken commits from reaching CI/CD. GitHub Actions will still run these checks, but catching issues first saves review time and keeps the main branch stable.

---

## Deployment

### Target Environment: Remote Proxmox Server
The app runs on a **remote Proxmox server**, NOT locally. **Never run docker commands locally expecting them to affect the deployed app.** Always confirm the target environment (local dev vs remote server) before running deployment or docker commands.

**When working with deployment:**
1. Confirm: Is this for local dev testing or the remote server?
2. Local dev: `docker compose up -d` in the project directory
3. Remote server: SSH into the server first, then run docker commands
4. Never assume a docker command affects the deployed version
5. Document which environment you're targeting in the commit message

---

## Debugging Guidelines

### Systematic Investigation Before Changes
When debugging, **do NOT guess at root causes in sequence**. Instead:
1. **Read the relevant code thoroughly first**
2. **Form a hypothesis based on evidence**, not guesses
3. **Explain your hypothesis to the user** before making changes
4. **Avoid shotgun debugging** — test one hypothesis at a time with validation

**Pattern:**
- "I found X in the code. This could cause Y because Z. Let me test this by reading/running..."
- NOT: "Let me try changing this... nope. Let me try this... nope. Let me try..."

---

## Media/Metadata Processing

### GPS/Geolocation Metadata (EXIF, XMP)
For GPS/geolocation metadata (EXIF, XMP), **always verify the exact tag names, sign conventions, and format strings against exiftool documentation** before writing. **Latitude south and longitude west must be negative.**

**Critical rules:**
- **North latitude:** positive, **South latitude:** negative (e.g., Sydney = -33.87)
- **East longitude:** positive, **West longitude:** negative (e.g., NYC = -74.01)
- XMP format: `<rdf:li>{coordinate}/1,{coordinate}/1,{coordinate}/1</rdf:li>`
- EXIF tags: `GPSLatitude`, `GPSLatitudeRef` (N/S), `GPSLongitude`, `GPSLongitudeRef` (E/W)
- Always check exiftool docs: `exiftool -a -G1 file.jpg | grep -i gps`

**Before writing metadata:**
1. Verify the exact tag name in exiftool documentation
2. Double-check sign conventions for your coordinate system
3. Test on a sample file and validate with exiftool before production use
4. Log GPS data for verification (don't silently write it)

---

## Installation & Setup

### Clone & Configure
```bash
git clone <repo> ~/git/miximixi
cd ~/git/miximixi
# Agents are auto-discovered from .github/agents/
```

### VS Code
Agents appear in Copilot Chat:
```
Type: @backend
Wait for autocomplete suggestion "Backend Developer"
```

### Claude Code
Agents are available when opening the project:
```
Select agent from sidebar → Miximixi agents → Backend Developer
```

---

## Quick Reference

| Agent | Focus | Tech Stack | Status |
|-------|-------|-----------|--------|
| Backend Developer | FastAPI APIs, Database, LLM | Python, Poetry, Supabase SQL | Active ✅ |
| DevOps Engineer | Containers, Environment, Deployment | Docker, Compose, Bash | Active ✅ |
| LLM Engineer | Recipe Extraction, Media Processing | Python, Gemini/Claude APIs, ffmpeg | Active ✅ |
| Frontend Developer | React Components, Styling, State | React, TypeScript, Tailwind CSS | Active ✅ |
| Product Owner | Requirements, Specs, Roadmap | User Stories, GitHub Issues, Docs | Active ✅ |
| QA Engineer | Testing, QA, Performance | pytest, Test Plans, Metrics | Active ✅ |

---

## Contributing to Agents

To add or update agents:

1. **Edit the agent.md file** directly in `.github/agents/`
2. **Test in VS Code** by reloading Copilot Chat
3. **Document in this registry** with updated examples
4. **Create PR** with domain tag: `[agents] Add frontend-developer agent`

See individual agent files for detailed context and tool restrictions.

---

## Troubleshooting

### Agent not appearing in chat?
- Reload VS Code window (`Cmd+Shift+P` → Reload Window)
- Ensure `.github/agents/*.agent.md` files exist
- Check frontmatter YAML syntax (must have `---` markers)

### Agent responses too generic?
- Agents need context. Use full paths: `/backend/app/llm_provider.py` not `llm_provider.py`
- Include error messages or code snippets for better diagnosis
- Reference architecture docs: `docs/architecture.md`

### Tool access issues?
- Some tools (terminal, Docker) require confirmation
- Backend agent can't modify frontend files (by design)
- Use the default agent for cross-domain tasks

---

**Last updated:** 2026-04-13  
**Maintained by:** Dev Team  
**Related docs:** `docs/architecture.md`, `docs/deployment.md`
