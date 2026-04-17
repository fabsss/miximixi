# Queue Worker Tests - CI/CD Integration

## Automatic CI/CD Execution

Yes, these tests are **automatically part of the CI/CD regression test pool**. They run on every push and pull request.

### When Tests Run

The CI pipeline (`.github/workflows/ci.yml`) executes on:
- ✅ Every push to `main` branch
- ✅ Every pull request to `main` branch

### CI Test Execution Steps

The CI workflow runs three test phases:

#### 1. Unit Tests
```bash
poetry run pytest tests/unit/ -v --tb=short
```
- Location: `tests/unit/`
- Status: Runs in CI

#### 2. Functional Tests (INCLUDING Queue Worker Tests)
```bash
poetry run pytest tests/functional/ -v --tb=short
```
- Location: `tests/functional/test_queue_worker.py`
- Count: 18 tests
- Status: ✅ **Runs in CI**
- Execution time: ~4.5 seconds

#### 3. Full Test Suite with Coverage Report
```bash
poetry run pytest tests/ -v --tb=short --cov=app --cov-report=term-missing --cov-report=xml
```
- Includes all tests from steps 1 and 2
- Generates code coverage metrics
- Uploads coverage report as artifact

### Test Discovery

CI will automatically discover and run all tests in:
```
tests/functional/test_queue_worker.py
  ✓ test_claim_no_pending_job_returns_none
  ✓ test_claim_sets_status_to_processing
  ✓ test_semaphore_limits_concurrency
  ✓ test_notify_callback_called_on_success
  ✓ test_notify_callback_called_on_error
  ✓ test_no_chat_id_no_user_notification
  ✓ test_chat_id_nulled_after_notification
  ✓ test_save_recipe_to_db_complete_transaction
  ✓ test_save_recipe_to_db_with_empty_ingredients
  ✓ test_save_recipe_to_db_rollback_on_error
  ✓ test_parallel_job_processing_with_semaphore
  ✓ test_asyncio_to_thread_prevents_blocking
  ✓ test_concurrent_jobs_with_independent_failures
  ✓ test_process_job_wraps_all_blocking_operations
  ✓ test_multiple_jobs_with_race_conditions
  ✓ test_job_with_large_recipe_data
  ✓ test_stress_test_claim_jobs_under_load
  ✓ test_extraction_status_transitions
```

### CI/CD Flow

```
Developer Push/PR
        ↓
GitHub Actions Triggered
        ↓
┌─────────────────────────────────────────┐
│  Backend Tests (Python)                 │
│  - Set up Python 3.12                   │
│  - Install Poetry & dependencies        │
│  - Run unit tests                       │
│  - Run functional tests ← QUEUE TESTS   │
│  - Generate coverage report             │
└─────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────┐
│  Frontend Checks (TypeScript)           │
│  - Set up Node 20                       │
│  - Type check                           │
│  - Lint                                 │
│  - Build                                │
└─────────────────────────────────────────┘
        ↓
All Checks Passed ✅ → Allow Merge
OR
Any Test Failed ❌ → Block Merge
```

### Regression Test Pool

Your queue worker tests are now part of the permanent regression test pool:

| Test Suite | Count | Location | CI Status |
|-----------|-------|----------|-----------|
| Queue Worker | 18 | `tests/functional/test_queue_worker.py` | ✅ Auto-run |
| LLM Provider | 8 | `tests/unit/test_llm_provider.py` | ✅ Auto-run |
| Models | 16 | `tests/unit/test_models.py` | ✅ Auto-run |
| Media Processor | 4 | `tests/unit/test_media_processor.py` | ✅ Auto-run |
| Telegram Bot | 2 | `tests/unit/test_telegram_bot.py` | ✅ Auto-run |
| Main Routes | 6 | `tests/functional/test_main_routes.py` | ✅ Auto-run |

**Total: 54 tests automatically run on every push/PR**

### Coverage Artifacts

CI generates and uploads coverage reports:
- Format: XML (code coverage format)
- Location: `backend/coverage.xml`
- Artifact: `backend-coverage`
- Available: In GitHub Actions artifacts after each run

### CI Environment

The CI environment differs from local development:
- **OS**: Ubuntu Latest (Linux)
- **Python**: 3.12 (vs your local 3.13)
- **Database**: PostgreSQL 16 (via Docker service)
- **LLM Provider**: ollama (stubbed, no API keys)
- **API Keys**: Empty (GOOGLE_API_KEY, CLAUDE_API_KEY, OPENAI_API_KEY)

Our tests use mocks, so they don't require real API keys and run successfully in CI.

### Test Failure Impact

If any queue worker test fails in CI:
1. ❌ GitHub blocks the PR from merging
2. 📧 Notification sent to PR author
3. 🔧 Developer must fix the test
4. ✅ Re-run CI after fix
5. ✅ Merge only after all tests pass

### How to Monitor CI

#### In GitHub
1. Go to your PR
2. Scroll down to "Checks" section
3. Click on "Backend Tests" or "All Checks"
4. View test results in real-time

#### In GitHub Actions
1. Go to repo → Actions tab
2. Click on most recent workflow run
3. Click on "Backend Tests" job
4. See all test output and coverage

#### Command Line
```bash
# View CI workflow status
gh run list --branch main --limit 5

# Watch specific run
gh run view <run-id> --log

# Check if tests are passing
gh pr checks <pr-number>
```

### Test Requirements for CI Success

All tests must:
- ✅ Pass in ~4.5 seconds
- ✅ Use only mocks (no real API calls)
- ✅ Be deterministic (same result every run)
- ✅ Not depend on external services
- ✅ Clean up resources (close connections, delete temp files)
- ✅ Use asyncio for async tests

Your queue worker tests meet all these requirements.

### Adding More Tests

To add more tests to the regression pool:
1. Create test file in `tests/unit/` or `tests/functional/`
2. Name it `test_*.py`
3. Use pytest conventions
4. Push to GitHub
5. CI automatically discovers and runs it

Example:
```python
@pytest.mark.asyncio
async def test_my_new_feature():
    """This will automatically run in CI"""
    assert True
```

### Troubleshooting CI Failures

If tests pass locally but fail in CI:

1. **Python version mismatch**: CI uses Python 3.12, you may use 3.13
2. **Database state**: CI uses fresh PostgreSQL, check for hardcoded IDs
3. **File paths**: CI runs on Linux, use cross-platform paths
4. **Timing issues**: CI may be slower, check for hardcoded timeouts
5. **Missing dependencies**: Check `poetry.lock` is committed

Check CI logs:
```bash
gh run view <run-id> --log
# or view on github.com/actions page
```

### Best Practices

- **Keep tests fast**: Aim for <5 seconds total
- **Use mocks**: Don't depend on external services
- **Avoid flaky tests**: No sleep() calls for waiting, use proper async patterns
- **Clear names**: `test_asyncio_to_thread_prevents_blocking` > `test_blocking`
- **One concern per test**: Test one feature, not multiple
- **Document patterns**: Add docstrings explaining what's tested

## Summary

✅ **Your queue worker tests are automatically part of CI/CD**
✅ **They run on every push and PR**
✅ **They block merging if they fail**
✅ **Coverage is measured and reported**
✅ **18 tests, 4.5 second execution, 100% passing**

The regression test pool now includes comprehensive coverage of:
- Event loop safety and asyncio.to_thread() patterns
- Concurrency control with semaphores
- Database transaction atomicity
- Parallel job processing
- Edge cases and stress conditions
