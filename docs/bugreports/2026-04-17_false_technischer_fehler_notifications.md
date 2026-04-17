# Bug Report: False "Technischer Fehler" Notifications on Successful Imports

**Date:** 2026-04-17  
**Status:** FIXED  
**Severity:** Medium  
**Component:** Telegram Bot Notifications, Queue Worker

## Issue
User received 2x "Technischer Fehler" (technical error) Telegram notifications despite the recipes being successfully imported and saved to the database.

### Logs Evidence
- Recipe 1: `cbb9c0d3-383d-4d88-8812-a1d52e2a3329` extracted successfully (12:06:21)
- Recipe 2: `65d2ffc4-f84f-46ea-87d8-76edd6fec0c6` extracted successfully (12:06:55)
- Both recipes saved to DB successfully with frames and cover images
- Success notifications sent to Telegram at 12:06:23.907
- Yet user still received error notifications

## Root Cause
**Database connection lifecycle bug** in [`backend/app/queue_worker.py`](backend/app/queue_worker.py):

1. `_save_recipe_to_db()` function closes the DB connection after saving the recipe (line 144)
2. Parent function `process_job()` attempts to reuse the **closed connection** to null the `telegram_chat_id` (line 275)
3. This causes an exception in the except block, triggering error notification **despite successful save**

## Code Flow (Before Fix)
```python
# In process_job() - lines 265-278
try:
    db = get_db()
    cursor = db.cursor(cursor_factory=RealDictCursor)
    cursor.execute("UPDATE import_queue SET status = %s WHERE id = %s", ("processing", job_id))
    
    # ... extraction logic ...
    
    _save_recipe_to_db(recipe_data)  # ← CLOSES db connection internally!
    
    # Try to use closed connection
    cursor = db.cursor()  # ← FAILS! Connection closed by _save_recipe_to_db()
    cursor.execute("UPDATE import_queue SET telegram_chat_id = NULL WHERE id = %s", (job_id,))
except Exception as e:
    # Send error notification (even for closed connection error!)
    notify_telegram_error(e)  # ← FALSE ERROR NOTIFICATION
```

## Solution
Pass the DB connection to `_save_recipe_to_db()` instead of managing it internally, so the parent function maintains control of the connection lifecycle.

**Changes made:**
- Modified `_save_recipe_to_db(recipe_data, db)` signature to accept optional `db` parameter
- Removed internal `db.close()` from the function
- Updated all `process_job()` calls to pass `db` to `_save_recipe_to_db()`
- Single connection now lives for entire job processing, preventing UAF (use-after-close) errors

## Verification
After fix:
- ✅ Successful imports generate success notifications only
- ✅ Database connection remains open until job completion
- ✅ Only genuine errors trigger error notifications

## Files Modified
- `backend/app/queue_worker.py` - Fixed connection lifecycle management

## Impact
- **User Experience:** Eliminated false error notifications that confused users
- **Logging:** Success notifications now accurately reflect actual job status
- **Reliability:** Reduced noise in error tracking
