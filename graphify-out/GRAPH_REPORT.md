# Graph Report - C:\Users\fabia\git\miximixi  (2026-04-21)

## Corpus Check
- 54 files · ~264,543 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 726 nodes · 1299 edges · 59 communities detected
- Extraction: 58% EXTRACTED · 42% INFERRED · 0% AMBIGUOUS · INFERRED: 546 edges (avg confidence: 0.6)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]

## God Nodes (most connected - your core abstractions)
1. `SyncControl` - 120 edges
2. `LLMProvider` - 57 edges
3. `ExtractedRecipe` - 39 edges
4. `RecipeUpdateRequest` - 35 edges
5. `ImportRequest` - 34 edges
6. `ExtractionResult` - 32 edges
7. `extract_source_id()` - 29 edges
8. `ImportResponse` - 26 edges
9. `TranslationResponse` - 26 edges
10. `CategoryCountsResponse` - 25 edges

## Surprising Connections (you probably didn't know these)
- `SyncControl` --uses--> `Unit tests for instagram_sync_worker.py Tests: TC1-TC8 - Core sync worker funct`  [INFERRED]
  backend\app\instagram_sync_worker.py → backend\tests\unit\test_instagram_sync_worker.py
- `SyncControl` --uses--> `TC4-5: New post detection`  [INFERRED]
  backend\app\instagram_sync_worker.py → backend\tests\unit\test_instagram_sync_worker.py
- `SyncControl` --uses--> `TC4: detect_new_posts() returns empty list for no posts`  [INFERRED]
  backend\app\instagram_sync_worker.py → backend\tests\unit\test_instagram_sync_worker.py
- `SyncControl` --uses--> `TC5: detect_new_posts() returns all posts when none in DB`  [INFERRED]
  backend\app\instagram_sync_worker.py → backend\tests\unit\test_instagram_sync_worker.py
- `SyncControl` --uses--> `TC6: detect_new_posts() skips posts already in DB`  [INFERRED]
  backend\app\instagram_sync_worker.py → backend\tests\unit\test_instagram_sync_worker.py

## Communities

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (53): backfill(), Backfill source_type and source_id for all recipes without them., _extract_instagram_shortcode(), extract_source_id(), _extract_youtube_id(), get_source_type_from_url(), Source identifier extraction for deduplication. Normalizes URLs to extract plat, Detect source type from URL.      Args:         url: Full URL from import req (+45 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (39): BaseModel, _detect_media_type(), _fix_encoding(), _image_to_base64(), _normalize_category(), _parse_llm_response(), Repariert double-encoded UTF-8 Strings (Latin-1 mis-decoded als Unicode)., Normalisiert LLM-Kategorien auf erlaubte Werte. (+31 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (63): Manages sync state: enabled/disabled, selected collection, status, Enable automatic syncing, Disable automatic syncing, Select collection. Only ONE collection can be active at a time., Get current sync status, SyncControl, Functional/Integration tests for Instagram sync worker Tests: TC21-TC26 - Full, TC24B: Status dict reflects enabled state (+55 more)

### Community 3 - "Community 3"
Cohesion: 0.04
Nodes (69): get_available_collections(), Fetch all available Instagram saved collections via Instagram's private mobile A, collection_select_callback(), humanize_error(), is_admin(), is_allowed(), message_handler(), notify() (+61 more)

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (60): download_media(), download_website(), DownloadResult, Lädt eine Website herunter:     - Extrahiert Rezept-Bild (og:image → schema.org, Lädt Medien via yt-dlp herunter (Instagram, YouTube, öffentliche Posts).     Ex, _claim_next_pending_job(), _download_for_source(), _extract_source_label() (+52 more)

### Community 5 - "Community 5"
Cohesion: 0.14
Nodes (53): LLMProvider, create_import(), debug_recipe_step_images(), delete_recipe(), delete_step_image(), generate_slug(), get_categories(), get_category_counts() (+45 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (31): _download_image(), extract_cover_frame(), extract_cover_frame_at_timestamp(), extract_frame_at_timestamp(), extract_keyframes(), _find_largest_img(), _find_og_image(), _find_schema_image() (+23 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (32): detect_new_posts(), fetch_collection_posts(), get_db_connection(), get_monitored_collection(), has_recipe(), queue_recipe_imports(), Instagram Sync Worker Periodically syncs Instagram collections to recipe import, Fetch the SELECTED collection from instagram_sync_collections table.     Only O (+24 more)

### Community 8 - "Community 8"
Cohesion: 0.05
Nodes (23): mock_client(), mock_client_fixture(), mock_client_with_error(), mock_client_with_error_fixture(), Functional tests for FastAPI routes in app.main. These tests use mocked databas, Fixture-based mocking using monkeypatch, compatible with conftest client., Test that 'counts' in response is a dictionary., Test that 'total' in response is an integer. (+15 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (11): getCategoryCounts(), getHealth(), getHeroRecipes(), getRecipe(), getRecipes(), getTags(), request(), translateRecipe() (+3 more)

### Community 10 - "Community 10"
Cohesion: 0.1
Nodes (4): acquire(), formatAmount(), getDisplayAmount(), onVisible()

### Community 11 - "Community 11"
Cohesion: 0.22
Nodes (0): 

### Community 12 - "Community 12"
Cohesion: 0.25
Nodes (4): GlobalTimerButton(), getAudioContext(), playBell(), useTimers()

### Community 13 - "Community 13"
Cohesion: 0.36
Nodes (7): already_new_format(), main(), migrate_recipe(), Returns number of steps changed., Returns True if all {id} refs in text are already wrapped as [text]{id}., Call LLM to rewrite steps from {id} to [text]{id} format.     ingredients: [{"s, reformat_steps_via_llm()

### Community 14 - "Community 14"
Cohesion: 0.25
Nodes (6): app(), client(), Return temporary directories for tests, Create FastAPI app with temporary directories for testing, Create TestClient with proper directory setup, temp_dirs()

### Community 15 - "Community 15"
Cohesion: 0.4
Nodes (5): get_collection_media_urls(), _get_loader(), Instagram Collection Poller via instaloader. Authentifizierung via cookies.txt (, Erstellt einen authentifizierten instaloader-Client via sessionid aus cookies.tx, Gibt die neuesten URLs aus der konfigurierten Instagram Saved Collection zurück.

### Community 16 - "Community 16"
Cohesion: 0.33
Nodes (4): Test that database constraints enforce deduplication correctly, TC7: Unique index on (source_type, source_id) should prevent duplicates for Inst, TC8: Multiple web recipes should be allowed even with NULL source_id         (u, TestDatabaseConstraints

### Community 17 - "Community 17"
Cohesion: 0.33
Nodes (0): 

### Community 18 - "Community 18"
Cohesion: 0.4
Nodes (2): BaseSettings, Settings

### Community 19 - "Community 19"
Cohesion: 0.4
Nodes (2): categoryChipCls(), getCategoryBgColor()

### Community 20 - "Community 20"
Cohesion: 0.67
Nodes (2): Execute all SQL migrations from the migrations/ directory., run_migrations()

### Community 21 - "Community 21"
Cohesion: 0.67
Nodes (0): 

### Community 22 - "Community 22"
Cohesion: 0.67
Nodes (0): 

### Community 23 - "Community 23"
Cohesion: 0.67
Nodes (0): 

### Community 24 - "Community 24"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Community 25"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (1): Parse allowed user IDs from comma-separated string.

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (1): Parse admin IDs from comma-separated string.

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Community 31"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Community 32"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Community 33"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Community 34"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Community 35"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Community 36"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "Community 37"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "Community 38"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Community 39"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Community 40"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Community 41"
Cohesion: 1.0
Nodes (1): Workspace Agent Registry

### Community 42 - "Community 42"
Cohesion: 1.0
Nodes (1): Backend Developer Agent

### Community 43 - "Community 43"
Cohesion: 1.0
Nodes (1): Backend Performance Fix & Test Suite Implementation

### Community 44 - "Community 44"
Cohesion: 1.0
Nodes (1): Miximixi Architecture & Tech Stack

### Community 45 - "Community 45"
Cohesion: 1.0
Nodes (1): Miximixi Design System 'The Modern Heirloom'

### Community 46 - "Community 46"
Cohesion: 1.0
Nodes (1): Rezepte-App – Handover Document for Claude Code

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (1): Production Deployment Guide

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (1): Development Deployment Setup

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (1): Quick Start Guide

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (1): Testing Guide

### Community 51 - "Community 51"
Cohesion: 1.0
Nodes (1): Master Plan Overview

### Community 52 - "Community 52"
Cohesion: 1.0
Nodes (1): Instagram Poller Worker Implementation Plan

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (1): Multi-User Authentication Plan

### Community 54 - "Community 54"
Cohesion: 1.0
Nodes (1): Frontend Improvements Plan (2026-04-17)

### Community 55 - "Community 55"
Cohesion: 1.0
Nodes (1): Step Picture Management Plan (2026-04-17)

### Community 56 - "Community 56"
Cohesion: 1.0
Nodes (1): Persistent Global Timers Plan (2026-04-20)

### Community 57 - "Community 57"
Cohesion: 1.0
Nodes (1): Shortcode Deduplication Plan (2026-04-21)

### Community 58 - "Community 58"
Cohesion: 1.0
Nodes (1): Color System Documentation

## Knowledge Gaps
- **175 isolated node(s):** `Execute all SQL migrations from the migrations/ directory.`, `Parse allowed user IDs from comma-separated string.`, `Parse admin IDs from comma-separated string.`, `Instagram Collection Poller via instaloader. Authentifizierung via cookies.txt (`, `Erstellt einen authentifizierten instaloader-Client via sessionid aus cookies.tx` (+170 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 24`** (2 nodes): `NavDrawerContext.tsx`, `NavDrawerProvider()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (2 nodes): `useNavDrawer.ts`, `useNavDrawer()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (2 nodes): `theme.ts`, `applyTheme()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (1 nodes): `Parse allowed user IDs from comma-separated string.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (1 nodes): `Parse admin IDs from comma-separated string.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (1 nodes): `run_migrations.ps1`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (1 nodes): `eslint.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (1 nodes): `vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (1 nodes): `test-setup.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (1 nodes): `AppLayout.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (1 nodes): `TimerOverlay.test.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (1 nodes): `NavDrawerContextValue.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (1 nodes): `Workspace Agent Registry`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (1 nodes): `Backend Developer Agent`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (1 nodes): `Backend Performance Fix & Test Suite Implementation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (1 nodes): `Miximixi Architecture & Tech Stack`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (1 nodes): `Miximixi Design System 'The Modern Heirloom'`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (1 nodes): `Rezepte-App – Handover Document for Claude Code`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (1 nodes): `Production Deployment Guide`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (1 nodes): `Development Deployment Setup`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (1 nodes): `Quick Start Guide`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (1 nodes): `Testing Guide`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (1 nodes): `Master Plan Overview`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (1 nodes): `Instagram Poller Worker Implementation Plan`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (1 nodes): `Multi-User Authentication Plan`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (1 nodes): `Frontend Improvements Plan (2026-04-17)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (1 nodes): `Step Picture Management Plan (2026-04-17)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (1 nodes): `Persistent Global Timers Plan (2026-04-20)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (1 nodes): `Shortcode Deduplication Plan (2026-04-21)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (1 nodes): `Color System Documentation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `LLMProvider` connect `Community 5` to `Community 1`, `Community 4`, `Community 13`, `Community 6`?**
  _High betweenness centrality (0.258) - this node is a cross-community bridge._
- **Why does `SyncControl` connect `Community 2` to `Community 3`, `Community 5`, `Community 7`?**
  _High betweenness centrality (0.240) - this node is a cross-community bridge._
- **Why does `_save_recipe_to_db()` connect `Community 4` to `Community 0`?**
  _High betweenness centrality (0.162) - this node is a cross-community bridge._
- **Are the 112 inferred relationships involving `SyncControl` (e.g. with `lifespan()` and `.test_full_sync_respects_enabled_flag()`) actually correct?**
  _`SyncControl` has 112 INFERRED edges - model-reasoned connections that need verification._
- **Are the 40 inferred relationships involving `LLMProvider` (e.g. with `translate_recipe()` and `main()`) actually correct?**
  _`LLMProvider` has 40 INFERRED edges - model-reasoned connections that need verification._
- **Are the 37 inferred relationships involving `ExtractedRecipe` (e.g. with `_parse_llm_response()` and `.test_full_recipe_json()`) actually correct?**
  _`ExtractedRecipe` has 37 INFERRED edges - model-reasoned connections that need verification._
- **Are the 33 inferred relationships involving `RecipeUpdateRequest` (e.g. with `.test_update_request_all_optional()` and `.test_update_request_partial()`) actually correct?**
  _`RecipeUpdateRequest` has 33 INFERRED edges - model-reasoned connections that need verification._