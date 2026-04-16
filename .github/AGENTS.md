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
- Managing Supabase, Ollama, n8n infrastructure

**Domain focus:** `Dockerfile`, `docker-compose.yml`, `.env`, `deployment.md`

**Example prompts:**
- `@devops-engineer why is n8n failing to start?`
- `@devops-engineer help me set up SSLfor the reverse proxy`
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

## Branching & Code Review Workflow

All agents enforce these practices:

### Branch Naming
```
<agent-domain>/<feature-or-fix>
```

**Examples by agent:**
- `backend/add-recipe-translation-api`
- `devops/fix-n8n-postgres-healthcheck`
- `llm/improve-gemini-extraction-prompt`

### Commit Guidelines
Each agent reminds you to:
1. **Reference the issue**: `Fixes #42: Add recipe translation API`
2. **Include domain tag**: `[backend]`, `[devops]`, `[llm]`
3. **Keep commits small**: One feature per commit (easier to review)
4. **NEVER MERGE A BRANCH TO MAINLINE WITHOUT A PROPER PR!!!**

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
