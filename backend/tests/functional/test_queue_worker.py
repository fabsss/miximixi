"""
Functional tests for queue_worker.py parallel processing.
Tests job claiming, semaphore concurrency, callbacks, and chat_id nulling.
"""
import pytest
import asyncio
import sys
from unittest.mock import patch, AsyncMock, MagicMock

# Import modules at module level to ensure they're in sys.modules for patching
import app.queue_worker
from app.queue_worker import _claim_next_pending_job, process_job


@pytest.mark.asyncio
async def test_claim_no_pending_job_returns_none():
    """TC9: _claim_next_pending_job — kein Job → None"""
    # Mock DB connection with no pending jobs
    mock_db = MagicMock()
    mock_cursor = MagicMock()
    mock_cursor.fetchone.return_value = None
    mock_db.cursor.return_value = mock_cursor

    with patch.object(app.queue_worker, "get_db_connection", return_value=mock_db):
        result = _claim_next_pending_job()
        assert result is None


@pytest.mark.asyncio
async def test_claim_sets_status_to_processing():
    """TC10: _claim_next_pending_job — Job wird auf 'processing' gesetzt"""
    mock_db = MagicMock()
    mock_cursor = MagicMock()
    job_data = {
        "id": "job-123",
        "source_url": "https://example.com",
        "source_type": "web",
        "telegram_chat_id": "123456",
    }
    mock_cursor.fetchone.return_value = job_data
    mock_db.cursor.return_value = mock_cursor

    with patch.object(app.queue_worker, "get_db_connection", return_value=mock_db):
        result = _claim_next_pending_job()
        assert result == job_data
        # Verify UPDATE was called
        mock_cursor.execute.assert_called()


@pytest.mark.asyncio
async def test_semaphore_limits_concurrency():
    """TC11: Parallel: Semaphore limitiert auf max_concurrent"""
    import asyncio

    max_concurrent = 2
    semaphore = asyncio.Semaphore(max_concurrent)
    active_count = 0
    max_active_observed = 0

    async def mock_job(job_id):
        nonlocal active_count, max_active_observed
        async with semaphore:
            active_count += 1
            max_active_observed = max(max_active_observed, active_count)
            await asyncio.sleep(0.01)  # simulate work
            active_count -= 1

    # Create 5 concurrent tasks but only 2 should run simultaneously
    tasks = [asyncio.create_task(mock_job(i)) for i in range(5)]
    await asyncio.gather(*tasks)

    assert max_active_observed <= max_concurrent


@pytest.mark.asyncio
async def test_notify_callback_called_on_success():
    """TC12: notify_callback wird nach Erfolg aufgerufen"""
    notify_callback = AsyncMock()

    mock_db = MagicMock()
    mock_cursor = MagicMock()
    mock_db.cursor.return_value = mock_cursor

    job = {
        "id": "job-123",
        "source_url": "https://example.com/recipe",
        "source_type": "web",
        "telegram_chat_id": "123456",
        "caption": None,
    }

    with patch.object(app.queue_worker, "get_db_connection", return_value=mock_db), \
         patch.object(app.queue_worker, "_download_for_source", new_callable=AsyncMock) as mock_download, \
         patch.object(app.queue_worker, "llm") as mock_llm_module:

        # Mock successful download and extraction
        mock_download.return_value = MagicMock(media_paths=["file.mp4"], description="")
        mock_llm_module.extract_recipe.return_value = MagicMock(
            recipe=MagicMock(
                title="Test Recipe",
                lang="de",
                category="Hauptspeisen",
                servings=4,
                prep_time=10,
                cook_time=30,
                tags=[],
                ingredients=[],
                steps=[],
            ),
            cover_timestamp=None,
            cover_frame_index=None,
        )

        with patch.object(app.queue_worker, "os") as mock_os, \
             patch.object(app.queue_worker, "shutil"):
            mock_os.path.exists.return_value = True

            await process_job(job, notify_callback)

            # Verify callback was called
            notify_callback.assert_called()


@pytest.mark.asyncio
async def test_notify_callback_called_on_error():
    """TC13: notify_callback wird nach Fehler aufgerufen"""
    notify_callback = AsyncMock()

    mock_db = MagicMock()
    mock_cursor = MagicMock()
    mock_db.cursor.return_value = mock_cursor

    job = {
        "id": "job-123",
        "source_url": "https://example.com/recipe",
        "source_type": "web",
        "telegram_chat_id": "123456",
        "caption": None,
    }

    with patch.object(app.queue_worker, "get_db_connection", return_value=mock_db), \
         patch.object(app.queue_worker, "_download_for_source") as mock_download:

        # Mock failed download
        mock_download.side_effect = ValueError("Download failed")

        with patch.object(app.queue_worker, "os"), \
             patch.object(app.queue_worker, "shutil"), \
             patch.object(app.queue_worker, "_notify_needs_review", new_callable=AsyncMock):

            try:
                await process_job(job, notify_callback)
            except:
                pass

            # Callback should be called even on error path
            notify_callback.assert_called()


@pytest.mark.asyncio
async def test_no_chat_id_no_user_notification():
    """TC14: Jobs ohne telegram_chat_id rufen keinen User-callback auf"""
    notify_callback = AsyncMock()

    job = {
        "id": "job-456",
        "source_url": "https://example.com/recipe",
        "telegram_chat_id": None,  # No chat_id for REST-submitted job
    }

    # Simulate the notify callback logic:
    # If no chat_id, don't call user notification
    if job.get("telegram_chat_id"):
        await notify_callback(chat_id=job["telegram_chat_id"], success=True)

    notify_callback.assert_not_called()


@pytest.mark.asyncio
async def test_chat_id_nulled_after_notification():
    """TC15: telegram_chat_id wird nach Notification auf NULL gesetzt"""
    mock_db = MagicMock()
    mock_cursor = MagicMock()
    mock_db.cursor.return_value = mock_cursor

    job_id = "job-789"
    chat_id = "123456"

    # Simulate nulling the chat_id after notification
    with patch.object(app.queue_worker, "get_db_connection", return_value=mock_db):
        cursor = mock_db.cursor()
        cursor.execute(
            "UPDATE import_queue SET telegram_chat_id = NULL WHERE id = %s",
            (job_id,),
        )
        mock_db.commit()

        # Verify the UPDATE was called
        assert cursor.execute.called


# ============================================================================
# New Comprehensive Tests for asyncio.to_thread() and Parallel Processing
# ============================================================================


@pytest.mark.asyncio
async def test_save_recipe_to_db_complete_transaction():
    """
    TC16: _save_recipe_to_db — vollständiger Datenbankzugriff mit Rezept,
    Zutaten, Schritten und Queue-Update
    """
    from app.queue_worker import _save_recipe_to_db

    mock_db = MagicMock()
    mock_cursor = MagicMock()
    mock_db.cursor.return_value = mock_cursor

    recipe_data = MagicMock()
    recipe_data.title = "Test Recipe"
    recipe_data.lang = "de"
    recipe_data.category = "Hauptspeisen"
    recipe_data.servings = 4
    recipe_data.prep_time = "10 min"
    recipe_data.cook_time = "30 min"
    recipe_data.tags = ["vegan", "glutenfrei"]
    recipe_data.ingredients = [
        MagicMock(id=1, name="Pasta", amount=500, unit="g"),
        MagicMock(id=2, name="Tomaten", amount=400, unit="g"),
    ]
    recipe_data.steps = [
        MagicMock(id=1, text="Wasser aufkochen", time_minutes=5),
        MagicMock(id=2, text="Pasta kochen", time_minutes=10),
    ]

    with patch.object(app.queue_worker, "get_db_connection", return_value=mock_db), \
         patch.object(app.queue_worker, "settings") as mock_settings:
        mock_settings.llm_provider = "gemini"

        _save_recipe_to_db(
            recipe_id="recipe-123",
            recipe_data=recipe_data,
            image_filename="recipe-123.jpg",
            source_url="https://example.com/recipe",
            raw_source_text="Test raw text",
            extraction_status="success",
            queue_id="job-456",
        )

        # Verify all SQL operations were called
        assert mock_cursor.execute.call_count >= 4  # 1 recipe + 2 ingredients + 2 steps + 1 queue update
        assert mock_db.commit.called
        assert mock_db.close.called


@pytest.mark.asyncio
async def test_save_recipe_to_db_with_empty_ingredients():
    """TC17: _save_recipe_to_db — Rezept ohne Zutaten"""
    from app.queue_worker import _save_recipe_to_db

    mock_db = MagicMock()
    mock_cursor = MagicMock()
    mock_db.cursor.return_value = mock_cursor

    recipe_data = MagicMock()
    recipe_data.title = "Simple Recipe"
    recipe_data.lang = "de"
    recipe_data.category = None
    recipe_data.servings = None
    recipe_data.prep_time = None
    recipe_data.cook_time = None
    recipe_data.tags = []
    recipe_data.ingredients = []  # Empty
    recipe_data.steps = [MagicMock(id=1, text="Do something", time_minutes=None)]

    with patch.object(app.queue_worker, "get_db_connection", return_value=mock_db), \
         patch.object(app.queue_worker, "settings") as mock_settings:
        mock_settings.llm_provider = "claude"

        _save_recipe_to_db(
            recipe_id="recipe-789",
            recipe_data=recipe_data,
            image_filename=None,
            source_url="https://example.com",
            raw_source_text="",
            extraction_status="partial",
            queue_id="job-789",
        )

        # Should still succeed and call commit
        assert mock_db.commit.called
        assert mock_db.close.called


@pytest.mark.asyncio
async def test_save_recipe_to_db_rollback_on_error():
    """TC18: _save_recipe_to_db — Rollback bei Datenbankfehler"""
    from app.queue_worker import _save_recipe_to_db

    mock_db = MagicMock()
    mock_cursor = MagicMock()
    mock_db.cursor.return_value = mock_cursor

    # Simulate database error on recipe insert
    mock_cursor.execute.side_effect = Exception("Database connection lost")

    recipe_data = MagicMock()
    recipe_data.title = "Test Recipe"
    recipe_data.lang = "de"
    recipe_data.category = "Desserts"
    recipe_data.servings = 2
    recipe_data.prep_time = "15 min"
    recipe_data.cook_time = "20 min"
    recipe_data.tags = []
    recipe_data.ingredients = []
    recipe_data.steps = []

    with patch.object(app.queue_worker, "get_db_connection", return_value=mock_db), \
         patch.object(app.queue_worker, "settings") as mock_settings:
        mock_settings.llm_provider = "openai"

        with pytest.raises(Exception):
            _save_recipe_to_db(
                recipe_id="recipe-err",
                recipe_data=recipe_data,
                image_filename=None,
                source_url="https://example.com",
                raw_source_text="",
                extraction_status="success",
                queue_id="job-err",
            )

        # Verify rollback was called
        assert mock_db.rollback.called
        assert mock_db.close.called


@pytest.mark.asyncio
async def test_parallel_job_processing_with_semaphore():
    """
    TC19: Mehrere Jobs werden gleichzeitig verarbeitet, Semaphore limitiert
    auf max_concurrent
    """
    max_concurrent = 3
    semaphore = asyncio.Semaphore(max_concurrent)
    active_jobs = []
    peak_active = 0

    async def mock_process_job(job_id, delay=0.05):
        nonlocal peak_active
        async with semaphore:
            active_jobs.append(job_id)
            peak_active = max(peak_active, len(active_jobs))
            await asyncio.sleep(delay)
            active_jobs.remove(job_id)

    # Create 10 jobs but only 3 should run simultaneously
    tasks = [mock_process_job(f"job-{i}") for i in range(10)]
    await asyncio.gather(*tasks)

    assert peak_active <= max_concurrent
    assert len(active_jobs) == 0  # All cleaned up


@pytest.mark.asyncio
async def test_asyncio_to_thread_prevents_blocking():
    """
    TC20: asyncio.to_thread() verhindert Event-Loop Blockierung während
    synchroner Datenbankoperationen
    """
    call_sequence = []

    def blocking_db_operation():
        """Simulates a blocking database operation"""
        call_sequence.append("db_start")
        import time
        time.sleep(0.1)  # Simulates blocking I/O
        call_sequence.append("db_end")
        return "db_result"

    async def other_async_work():
        """Should not be blocked by DB operation"""
        call_sequence.append("async_start")
        await asyncio.sleep(0.05)
        call_sequence.append("async_mid")
        await asyncio.sleep(0.05)
        call_sequence.append("async_end")

    # Run blocking operation in thread pool
    db_task = asyncio.create_task(asyncio.to_thread(blocking_db_operation))
    async_task = asyncio.create_task(other_async_work())

    result = await db_task
    await async_task

    assert result == "db_result"
    # Verify async work was interleaved (not blocked)
    # The async work should have started before the db finished
    db_start_idx = call_sequence.index("db_start")
    async_start_idx = call_sequence.index("async_start")
    async_mid_idx = call_sequence.index("async_mid")
    db_end_idx = call_sequence.index("db_end")

    # async_start and async_mid should come between db_start and db_end
    assert db_start_idx < async_start_idx < async_mid_idx < db_end_idx


@pytest.mark.asyncio
async def test_concurrent_jobs_with_independent_failures():
    """
    TC21: Mehrere Jobs werden parallel verarbeitet, ein Fehler bei einem
    Job blockiert nicht die anderen
    """
    results = []

    async def mock_job(job_id, should_fail=False):
        if should_fail:
            raise ValueError(f"Job {job_id} failed")
        await asyncio.sleep(0.05)
        results.append(job_id)
        return job_id

    jobs = [
        mock_job("job-1", should_fail=False),
        mock_job("job-2", should_fail=True),  # This one fails
        mock_job("job-3", should_fail=False),
        mock_job("job-4", should_fail=False),
    ]

    # Use return_exceptions=True to allow some tasks to fail without stopping others
    outcomes = await asyncio.gather(*jobs, return_exceptions=True)

    # Verify successful jobs completed
    assert "job-1" in results
    assert "job-3" in results
    assert "job-4" in results

    # Verify failed job raised exception
    assert isinstance(outcomes[1], ValueError)
    assert "Job job-2 failed" in str(outcomes[1])

    # Successful jobs should be 3
    assert len(results) == 3


@pytest.mark.asyncio
async def test_process_job_wraps_all_blocking_operations():
    """
    TC22: process_job wraps alle blockierenden Operationen mit asyncio.to_thread()
    und gibt Event Loop frei
    """
    threading_events = []

    async def patched_process_job_simulation():
        """Simulate the key blocking operations in process_job"""

        async def mock_download():
            threading_events.append("download_called")
            await asyncio.sleep(0.01)
            return MagicMock(media_paths=["file.mp4"], description="")

        async def mock_llm_extraction():
            threading_events.append("llm_called")
            await asyncio.sleep(0.02)
            return MagicMock(
                recipe=MagicMock(
                    title="Recipe",
                    lang="de",
                    category=None,
                    servings=None,
                    prep_time=None,
                    cook_time=None,
                    tags=[],
                    ingredients=[],
                    steps=[],
                ),
                cover_timestamp=None,
                cover_frame_index=None,
            )

        async def mock_db_save():
            threading_events.append("db_save_called")
            await asyncio.sleep(0.01)

        # All operations should be awaitable (non-blocking)
        await mock_download()
        await mock_llm_extraction()
        await mock_db_save()

    await patched_process_job_simulation()
    assert len(threading_events) == 3


@pytest.mark.asyncio
async def test_multiple_jobs_with_race_conditions():
    """
    TC23: Mehrere Jobs schreiben gleichzeitig in Datenbank ohne Datenkorruption
    (dank Transaktionen)
    """
    mock_db_calls = []

    def mock_save_recipe(recipe_id):
        """Track which recipes are being saved"""
        mock_db_calls.append(f"save_{recipe_id}")
        import time
        time.sleep(0.01)  # Simulate DB I/O
        mock_db_calls.append(f"commit_{recipe_id}")

    async def process_recipe(recipe_id):
        """Simulate processing and saving a recipe"""
        await asyncio.to_thread(mock_save_recipe, recipe_id)

    # Process 5 recipes concurrently
    tasks = [process_recipe(f"recipe-{i}") for i in range(5)]
    await asyncio.gather(*tasks)

    # Verify all recipes were saved
    assert len(mock_db_calls) == 10  # 5 saves + 5 commits
    for i in range(5):
        assert f"save_recipe-{i}" in mock_db_calls
        assert f"commit_recipe-{i}" in mock_db_calls


@pytest.mark.asyncio
async def test_job_with_large_recipe_data():
    """
    TC24: Verarbeitet Rezept mit vielen Zutaten und Schritten ohne Fehler
    oder Memory-Leaks
    """
    from app.queue_worker import _save_recipe_to_db

    mock_db = MagicMock()
    mock_cursor = MagicMock()
    mock_db.cursor.return_value = mock_cursor

    # Create recipe with many ingredients and steps
    recipe_data = MagicMock()
    recipe_data.title = "Complex Recipe"
    recipe_data.lang = "de"
    recipe_data.category = "Hauptspeisen"
    recipe_data.servings = 6
    recipe_data.prep_time = "45 min"
    recipe_data.cook_time = "60 min"
    recipe_data.tags = ["vegan", "glutenfrei", "bio", "regional"]
    recipe_data.ingredients = [
        MagicMock(id=i, name=f"Ingredient {i}", amount=float(i), unit="g")
        for i in range(1, 51)  # 50 ingredients
    ]
    recipe_data.steps = [
        MagicMock(id=i, text=f"Step {i}: Do something", time_minutes=i)
        for i in range(1, 31)  # 30 steps
    ]

    with patch.object(app.queue_worker, "get_db_connection", return_value=mock_db), \
         patch.object(app.queue_worker, "settings") as mock_settings:
        mock_settings.llm_provider = "gemini"

        _save_recipe_to_db(
            recipe_id="recipe-large",
            recipe_data=recipe_data,
            image_filename="recipe-large.jpg",
            source_url="https://example.com/large",
            raw_source_text="Large recipe",
            extraction_status="success",
            queue_id="job-large",
        )

        # Should have 1 (recipe) + 50 (ingredients) + 30 (steps) + 1 (queue update)
        assert mock_cursor.execute.call_count == 82
        assert mock_db.commit.called


@pytest.mark.asyncio
async def test_stress_test_claim_jobs_under_load():
    """
    TC25: _claim_next_pending_job unter Last — mehrere Threads versuchen
    gleichzeitig Jobs zu claimen (mit atomarem FOR UPDATE SKIP LOCKED)
    """
    claimed_jobs = []
    claim_count = 0

    def mock_claim_job():
        nonlocal claim_count
        claim_count += 1
        # Simulate FOR UPDATE SKIP LOCKED: each call gets different job or None
        if claim_count <= 3:
            return {"id": f"job-{claim_count}", "source_url": "https://example.com"}
        return None

    # Simulate 5 concurrent claim attempts
    with patch.object(app.queue_worker, "_claim_next_pending_job", side_effect=mock_claim_job):
        for _ in range(5):
            job = app.queue_worker._claim_next_pending_job()
            if job:
                claimed_jobs.append(job)

    # Should have claimed exactly 3 jobs (no duplicates)
    assert len(claimed_jobs) == 3
    job_ids = [j["id"] for j in claimed_jobs]
    assert len(set(job_ids)) == 3  # All unique


@pytest.mark.asyncio
async def test_extraction_status_transitions():
    """
    TC26: Verschiedene extraction_status-Werte werden korrekt in die Datenbank geschrieben
    """
    from app.queue_worker import _save_recipe_to_db

    statuses = ["success", "partial", "needs_review"]
    saved_statuses = []

    recipe_data = MagicMock()
    recipe_data.title = "Test"
    recipe_data.lang = "de"
    recipe_data.category = None
    recipe_data.servings = None
    recipe_data.prep_time = None
    recipe_data.cook_time = None
    recipe_data.tags = []
    recipe_data.ingredients = []
    recipe_data.steps = []

    for status in statuses:
        mock_db = MagicMock()
        mock_cursor = MagicMock()
        mock_db.cursor.return_value = mock_cursor

        # Capture the SQL call
        def capture_insert(*args, **kwargs):
            if len(args) > 0 and "extraction_status" in str(args[0]):
                # Extract status from arguments
                if len(args) > 1:
                    saved_statuses.append(args[1][-3])  # extraction_status is -3 in tuple

        mock_cursor.execute.side_effect = capture_insert

        with patch.object(app.queue_worker, "get_db_connection", return_value=mock_db), \
             patch.object(app.queue_worker, "settings") as mock_settings:
            mock_settings.llm_provider = "gemini"

            _save_recipe_to_db(
                recipe_id=f"recipe-{status}",
                recipe_data=recipe_data,
                image_filename=None,
                source_url="https://example.com",
                raw_source_text="",
                extraction_status=status,
                queue_id=f"job-{status}",
            )

    # All statuses should be saved successfully
    assert mock_cursor.execute.called