# Branching & Collaboration Guidelines

Standardized practices for all agents in Miximixi. Ensures clean history, easy reviews, and safe merges.

---

## Branch Naming Convention

**Format:** `<agent-domain>/<feature-or-fix>`

**Prefixes by agent:**
- `backend/` — Backend Developer
- `devops/` — DevOps Engineer
- `llm/` — LLM Engineer
- `frontend/` — Frontend Developer (when available)

**Examples:**
```
✅ backend/add-recipe-translation-api
✅ devops/upgrade-postgres-to-15.2
✅ llm/optimize-gemini-extraction
❌ add-feature  (missing domain)
❌ backend_add_translation  (wrong separator)
```

### Sub-branch for long-running work
If a feature spans multiple PRs, use sub-branches:
```
backend/big-feature/part-1
backend/big-feature/part-2
backend/big-feature/final
```

---

## Commit Message Format

### Structure
```
[domain] Brief description (50 chars max)

- Detail 1
- Detail 2
- Detail 3

Fixes #42
Co-authored-by: Name <email>
```

### Examples

**✅ Good:**
```
[backend] Add recipe translation endpoint

- POST /recipes/{id}/translate supports de, it, en, fr
- Uses Supabase pgml extension for translations
- Caches results in translations table
- Added unit tests for 5 language pairs

Fixes #42
```

**❌ Bad:**
```
fixed stuff
updated backend
did translation thing
```

### Rules
- Keep first line to **50 characters**
- Use imperative mood: "Add" not "Added", "Fix" not "Fixed"
- Include domain tag: `[backend]`, `[devops]`, `[llm]`
- Reference issue number: `Fixes #42`, `Related to #99`
- List meaningful changes (not "changed code", but "what changed and why")

---

## Pull Request Checklist

### Pre-PR: Local Testing

**All domains:**
- [ ] Code runs without errors
- [ ] No `console.log()`, `print()`, or debug code left in
- [ ] No hardcoded secrets or credentials
- [ ] Tested locally before pushing

**Backend-specific:**
- [ ] Unit tests pass: `poetry run pytest -v`
- [ ] Endpoints tested with curl/Postman
- [ ] Database migrations included & tested

**DevOps-specific:**
- [ ] Docker builds: `docker compose build`
- [ ] Services start: `docker compose up -d && docker compose ps`
- [ ] All env vars in `.env.example`

**LLM-specific:**
- [ ] Prompt tested with 3+ diverse inputs
- [ ] Quality metrics documented
- [ ] Token/cost estimates provided

### PR Title Format
```
[domain] Brief description
```

**Examples:**
```
[backend] Add recipe translation API
[devops] Fix n8n healthcheck timeout
[llm] Improve Gemini extraction for video captions
```

### PR Description Template
```markdown
## What
Brief description of the change.

## Why
Why is this change needed? What problem does it solve?

## How
Technical explanation of the solution.

## Testing
How was this tested? Include steps to verify.

## Screenshots/Logs
(If applicable) Add images or error output.

## Checklist
- [ ] Tests pass
- [ ] Documentation updated
- [ ] No breaking changes
- [ ] Environment variables documented
```

---

## Code Review Process

### Request Review
1. Push to your branch (e.g., `backend/add-translation`)
2. Create PR against `main`
3. Request review from one agent expert (or team lead)
4. Link related issue: "Fixes #42"

### Review Guidelines

**Reviewer checklist:**
- [ ] Code follows agent's standards (from `.agent.md`)
- [ ] Commits follow naming convention
- [ ] No hardcoded secrets
- [ ] Tests pass (CI should verify)
- [ ] Documentation updated if needed
- [ ] No unnecessary breaking changes

**Comment style:**
- ❌ "This is wrong"
- ✅ "This could fail if X happens. Let's add a check for X"
- ✅ "Nice! Consider also handling the error case on line 42"

### Approval & Merge
1. Reviewer approves
2. All CI checks pass (linting, tests, build)
3. Squash merge to `main` (or rebase, if preferred)
4. Delete branch after merge

---

## Workflow: New Feature

### Example: Backend adds recipe translation

```bash
# 1. Create branch
git checkout -b backend/add-translation

# 2. Make changes
# - app/models.py (add TranslateRequest, TranslateResponse)
# - app/main.py (add POST /recipes/{id}/translate endpoint)
# - supabase/migrations/010_translations_table.sql (schema)
# - poetry.add openai-python (if needed)
# - tests/test_translation.py (unit tests)

# 3. Commit
git add .
git commit -m "[backend] Add recipe translation endpoint

- POST /recipes/{id}/translate with target language
- Uses OpenAI API for translations
- Caches in translations table
- Added 5 language pair tests

Fixes #42"

# 4. Push
git push origin backend/add-translation

# 5. Create PR on GitHub
# - Link issue: "Fixes #42"
# - Assign reviewer
# - Set labels: type:feature, auth:backend

# 6. Wait for review & CI
# - Address review comments
# - Commit fixes with: git commit --amend

# 7. Merge
# - GitHub: "Squash and merge"
# - Delete branch
```

---

## Handling Conflicts

**If main has diverged:**
```bash
# Update your branch with latest main
git fetch origin
git rebase origin/main

# If conflicts:
# 1. Fix files
# 2. git add .
# 3. git rebase --continue

# Force push (only if your branch hasn't been reviewed)
git push --force-with-lease origin backend/add-translation
```

**Never force-push after code review!** Instead:
```bash
# Create fix commits - reviewer will see them
git commit -m "[backend] Fix review feedback: handle edge case on line X"

# Squash before merge (GitHub can do this automatically)
```

---

## Release Process

### Versioning
- `v1.0.0` format (major.minor.patch)
- Increment on: Breaking changes (major), New features (minor), Fixes (patch)

### Release Branch
```bash
# Create release branch from main
git checkout -b release/v1.1.0 main

# Update version numbers
# - backend/pyproject.toml: version = "1.1.0"
# - frontend/package.json: "version": "1.1.0"

# Create release commit
git commit -m "[release] Version 1.1.0

- Added recipe translation API
- Fixed n8n healthcheck timeout
- Improved Gemini prompt quality"

# Tag
git tag -a v1.1.0 -m "Release 1.1.0"
git push origin release/v1.1.0
git push origin --tags
```

---

## CI/CD Integration

### Required Checks (GitHub Actions)
- [ ] Lint passes (`black`, `pylint`, `prettier`)
- [ ] Tests pass (`pytest`, unit + integration)
- [ ] Build succeeds (`docker compose build`)
- [ ] No secrets detected (`gitleaks`)

### Example: Backend CI
```yaml
# .github/workflows/backend-test.yml
on:
  push:
    branches: [main, backend/**]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
      - run: pip install poetry
      - run: poetry install
      - run: poetry run pytest
      - run: poetry run black --check .
```

---

## Common Scenarios

### "I committed to main by mistake"
```bash
# Create a new branch from your commit
git branch backend/my-feature
git reset --hard HEAD~1  # Undo the commit on main
git push --force-with-lease origin main
git push origin backend/my-feature

# Create PR from backend/my-feature → main
```

### "I need to update my PR based on feedback"
```bash
# Make changes
git add .
git commit -m "[backend] Address review: improved error handling"

# Push (don't force!)
git push origin backend/my-feature

# Reviewer can see the new commit
```

### "I want to squash multiple commits"
```bash
# Interactive rebase
git rebase -i HEAD~3  # Last 3 commits

# In editor:
# pick c1a1a1 Add feature
# squash c2b2b2 Fix typo
# squash c3c3c3 Review feedback

# Save & exit → commits are squashed
git push --force-with-lease origin backend/my-feature
```

---

## Best Practices

✅ **Do:**
- Rebase before pushing (keep history linear)
- Commit often (atomic commits = easy rollback)
- Write meaningful commit messages
- Test locally before pushing
- Ask for help early if stuck

❌ **Don't:**
- Commit secrets or `.env` files
- Force-push to shared branches
- Merge your own PR without review
- Leave `console.log()` or `TODO:` comments
- Make huge commits with 20 unrelated changes

---

## Troubleshooting

**Q: "Your branch has diverged"**
```bash
git fetch origin
git rebase origin/main
git push --force-with-lease origin backend/feature
```

**Q: "Merge conflict"**
See "Handling Conflicts" section above

**Q: "How do I delete a branch?"**
```bash
git branch -D backend/old-feature  # Local
git push origin --delete backend/old-feature  # Remote
```

---

**Last updated:** 2026-04-13  
**Maintained by:** Dev Team  
**Related:** `.github/AGENTS.md`
