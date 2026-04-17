---
name: Step Picture Management in Recipe Edit
description: Add upload/change/remove step pictures in recipe edit mode with instant thumbnail preview
type: design
---

# Step Picture Management in Recipe Edit Mode

## Overview
Add the ability to manage step pictures (upload, change, delete) directly in the recipe edit panel. When a user enters edit mode, each step shows either an empty placeholder with an "Add picture" button, or an existing thumbnail with "Change" and "Delete" buttons.

## Goals
- Allow users to add pictures to steps during recipe editing
- Provide instant visual feedback (thumbnail preview) after file selection
- Enable changing or removing step pictures
- Follow existing recipe image upload pattern (Approach 1 from design)

## Design

### Data Model Extension

**StepDraft Type (extends existing)**
```typescript
interface StepDraft {
  text: string
  time_minutes: string
  step_image_file?: File | null          // New: pending file to upload
  step_image_deleted?: boolean            // New: marks existing image for deletion
  step_image_preview?: string | null      // New: preview URL (blob or existing)
}
```

### State Management
Three new state objects in `RecipeDetailPage`:
- `stepImageFiles`: `Map<number, File>` - pending file uploads indexed by step
- `stepImagePreviews`: `Map<number, string>` - preview URLs (blob or existing image URLs)
- `stepImageDeleted`: `Map<number, boolean>` - tracks deletion flags per step

Hidden file inputs per step (via ref array or index-keyed refs).

### UI States Per Step

| State | Display | Buttons |
|-------|---------|---------|
| No picture | Empty placeholder box (120×67px, 16:9) | "+ Add picture" button below |
| Existing picture | Thumbnail of current image | "Change" + "Delete" buttons (overlay or always visible) |
| New file selected | Thumbnail preview of selected file | "Change" + "Delete" buttons |
| Marked for deletion | Faded/disabled placeholder | "Undo" button |

### User Workflow

1. **Enter edit mode** → Steps display with existing pictures or empty placeholders
2. **Click "Add picture"** on empty step → File input opens
3. **Select file** → Blob URL created → Thumbnail shows **immediately**
4. **Change picture** → Click "Change" → File input opens again → New preview replaces old
5. **Delete picture** → Click "Delete" → Placeholder becomes faded, "Undo" button appears
6. **Save recipe** →
   - Recipe metadata (title, ingredients, steps text) patches via `PATCH /recipes/{id}`
   - For each step with pending file: `POST /recipes/{id}/steps/{stepId}/image`
   - For each step marked deleted: `DELETE /recipes/{id}/steps/{stepId}/image`
   - Refetch recipe to display final state

### Implementation Details

**File Selection & Preview**
- Use `URL.createObjectURL(file)` for instant blob preview
- Store file reference and preview URL in state maps
- Clean up blob URLs after upload (via `URL.revokeObjectURL()`)

**Upload Flow**
- On "Save" recipe: first patch recipe metadata (ingredients, steps text)
- After metadata saved, upload step images sequentially
- If step image upload fails, show error toast but don't block other uploads
- Refetch recipe after all uploads to refresh UI with final state

**Deletion Flow**
- On delete button click: set `stepImageDeleted[stepIndex] = true` in state
- Show faded placeholder with "Undo" button
- On save, send DELETE request for marked steps
- On undo: remove from `stepImageDeleted` map and restore preview

**State Cleanup**
- When exiting edit mode (Cancel), revoke all blob URLs
- After successful save, revoke uploaded file blob URLs
- Keep existing image URLs (not blob URLs) for display

### API Endpoints Required

Assuming backend provides:
- `POST /recipes/{id}/steps/{stepId}/image` - Upload step image (FormData with `file`)
- `DELETE /recipes/{id}/steps/{stepId}/image` - Delete step image

If backend uses PATCH for deletion instead:
- Modify `RecipeUpdateRequest` to include `steps[].step_image_deleted?: boolean`

### Component Structure

**Edit Panel Changes (inside recipe edit mode)**
```
{editDraft.steps.map((step, idx) => (
  <div key={idx}>
    {/* Existing step fields: text, time_minutes */}
    
    {/* NEW: Step picture section */}
    <div>
      <label>Schritt-Bild</label>
      {stepImageDeleted[idx] ? (
        <FadedPlaceholder with Undo button />
      ) : stepImagePreviews.get(idx) ? (
        <Thumbnail with Change/Delete buttons />
      ) : (
        <EmptyPlaceholder with Add button />
      )}
    </div>
  </div>
))}
```

### Error Handling
- File input error: Show toast, allow retry
- Image upload failure: Show toast per step, don't block other uploads
- If recipe patch fails: Cancel entire operation (don't upload step images)

### Testing Checklist
- [ ] Add picture to empty step → thumbnail shows immediately
- [ ] Change picture → old preview replaced, new one shows
- [ ] Delete picture → placeholder fades, "Undo" appears
- [ ] Undo delete → placeholder restored
- [ ] Save recipe → all step images upload successfully
- [ ] Save with deleted picture → DELETE request sent
- [ ] Cancel edit mode → blob URLs revoked, state cleared
- [ ] Multiple steps with pictures → all upload after save
- [ ] Upload failure → error toast shown, can retry

---

## Next Steps
1. Write implementation plan (use writing-plans skill)
2. Update API types in `frontend/src/lib/api.ts` if needed
3. Implement state management and UI in `RecipeDetailPage.tsx`
4. Test with local dev server
5. Create PR with domain tag `[frontend]`
