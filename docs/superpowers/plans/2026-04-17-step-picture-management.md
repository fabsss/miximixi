# Step Picture Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to upload, change, and delete step pictures directly in the recipe edit panel with instant thumbnail preview.

**Architecture:** Extend `StepDraft` with file and preview tracking. Use three state maps (`stepImageFiles`, `stepImagePreviews`, `stepImageDeleted`) to manage pending uploads and deletions. Upload step images sequentially after recipe metadata is saved, with error handling per image.

**Tech Stack:** React (hooks), TypeScript, Tailwind CSS, React Query, FormData API

---

## File Structure

**Files to modify:**
- `frontend/src/lib/api.ts` - Add step image upload/delete API functions
- `frontend/src/pages/RecipeDetailPage.tsx` - Add state, UI, and upload logic

**No new files needed** - all changes integrate into existing component.

---

## Task 1: Add API Functions for Step Image Management

**Files:**
- Modify: `frontend/src/lib/api.ts`

**Context:** Need two new functions to upload and delete step images. These follow the same pattern as `uploadRecipeImage()`.

- [ ] **Step 1: Add `uploadStepImage()` function**

Add this function after `uploadRecipeImage()` in `frontend/src/lib/api.ts`:

```typescript
export async function uploadStepImage(
  recipeId: string,
  stepId: string,
  file: File,
): Promise<void> {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch(`${API_BASE_URL}/recipes/${recipeId}/steps/${stepId}/image`, {
    method: 'POST',
    body: form,
  })
  if (!response.ok) throw new Error(`Step image upload failed: ${response.status}`)
}
```

- [ ] **Step 2: Add `deleteStepImage()` function**

Add this function after `uploadStepImage()`:

```typescript
export async function deleteStepImage(
  recipeId: string,
  stepId: string,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/recipes/${recipeId}/steps/${stepId}/image`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error(`Step image delete failed: ${response.status}`)
}
```

- [ ] **Step 3: Update imports in RecipeDetailPage to include new functions**

At the top of `RecipeDetailPage.tsx`, update the import from `../lib/api`:

```typescript
import {
  deleteRecipe,
  deleteStepImage,        // NEW
  getImageUrl,
  getRecipe,
  getStepImageUrl,
  translateRecipe,
  updateRecipe,
  uploadRecipeImage,
  uploadStepImage,        // NEW
  type RecipeUpdateRequest,
  type TranslationResponse,
} from '../lib/api'
```

- [ ] **Step 4: Commit API changes**

```bash
git add frontend/src/lib/api.ts frontend/src/pages/RecipeDetailPage.tsx
git commit -m "feat: add step image upload and delete API functions"
```

---

## Task 2: Extend StepDraft Type and Add State Variables

**Files:**
- Modify: `frontend/src/pages/RecipeDetailPage.tsx:200-235`

**Context:** The `StepDraft` type currently only has `text` and `time_minutes`. We need to extend it with step image tracking properties. Also initialize three state maps for managing file uploads, previews, and deletion flags.

- [ ] **Step 1: Extend StepDraft interface**

Find the `StepDraft` interface (around line 201) and update it:

```typescript
interface StepDraft { 
  text: string
  time_minutes: string
  step_image_file?: File | null          // NEW: pending file to upload
  step_image_deleted?: boolean            // NEW: marks existing image for deletion
  step_image_preview?: string | null      // NEW: preview URL (blob or existing)
}
```

- [ ] **Step 2: Add file input refs array**

After `fileInputRef` (line 234), add a new ref for step image inputs:

```typescript
const stepImageFileInputRefs = useRef<Record<number, HTMLInputElement | null>>({})
```

- [ ] **Step 3: Add three state maps for step images**

After `fileInputRef` initialization, add these state variables:

```typescript
const [stepImageFiles, setStepImageFiles] = useState<Map<number, File>>(new Map())
const [stepImagePreviews, setStepImagePreviews] = useState<Map<number, string>>(new Map())
const [stepImageDeleted, setStepImageDeleted] = useState<Map<number, boolean>>(new Map())
```

- [ ] **Step 4: Commit state structure changes**

```bash
git add frontend/src/pages/RecipeDetailPage.tsx
git commit -m "feat: extend StepDraft type and add step image state management"
```

---

## Task 3: Initialize Step Image Previews on Edit Mode Entry

**Files:**
- Modify: `frontend/src/pages/RecipeDetailPage.tsx:326-347`

**Context:** When user enters edit mode, we need to populate `stepImagePreviews` with existing step image URLs so they display in the edit panel.

- [ ] **Step 1: Update enterEditMode function**

Find the `enterEditMode()` function (line 326) and add initialization of step image previews after the `setIsEditMode(true)` line:

```typescript
const enterEditMode = () => {
  setEditDraft({
    title: recipe.title ?? '',
    category: recipe.category ?? '',
    servings: String(recipe.servings ?? ''),
    prep_time: recipe.prep_time ?? '',
    cook_time: recipe.cook_time ?? '',
    tags: (recipe.tags ?? []).join(', '),
    ingredients: (recipe.ingredients ?? []).map((ing) => ({
      name: ing.name, amount: ing.amount != null ? String(ing.amount) : '',
      unit: ing.unit ?? '', group_name: ing.group_name ?? '',
    })),
    steps: (recipe.steps ?? []).map((s) => ({
      text: s.text, time_minutes: s.time_minutes != null ? String(s.time_minutes) : '',
    })),
  })
  // NEW: Initialize step image previews with existing images
  const previews = new Map<number, string>()
  recipe.steps?.forEach((step, idx) => {
    if (step.step_image_filename) {
      previews.set(idx, getStepImageUrl(recipe.id, step.step_image_filename))
    }
  })
  setStepImagePreviews(previews)
  setStepImageFiles(new Map())
  setStepImageDeleted(new Map())
  setIsEditMode(true)
}
```

- [ ] **Step 2: Update cancelEditMode to cleanup blob URLs**

Find the `cancelEditMode()` function (line 345) and update it to revoke blob URLs:

```typescript
const cancelEditMode = () => {
  // Revoke all blob URLs before clearing state
  stepImagePreviews.forEach((url) => {
    if (url.startsWith('blob:')) {
      URL.revokeObjectURL(url)
    }
  })
  setEditDraft(null)
  setIsEditMode(false)
  setPendingImageFile(null)
  setImagePreviewUrl(null)
  setStepImageFiles(new Map())
  setStepImagePreviews(new Map())
  setStepImageDeleted(new Map())
}
```

- [ ] **Step 3: Commit edit mode initialization**

```bash
git add frontend/src/pages/RecipeDetailPage.tsx
git commit -m "feat: initialize step image previews on edit mode entry"
```

---

## Task 4: Add Step Image File Selection Handlers

**Files:**
- Modify: `frontend/src/pages/RecipeDetailPage.tsx:386-398`

**Context:** Add handlers for when user selects a file for a step image. These handlers create blob URLs for instant preview and store the file reference.

- [ ] **Step 1: Add handleStepImageChange handler**

Add this function after the `updateStep()` function (around line 385):

```typescript
const handleStepImageChange = (stepIdx: number, e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (!file) return
  
  // Store file and create blob preview
  const newFiles = new Map(stepImageFiles)
  newFiles.set(stepIdx, file)
  setStepImageFiles(newFiles)
  
  // Create blob URL for instant preview
  const blobUrl = URL.createObjectURL(file)
  const newPreviews = new Map(stepImagePreviews)
  newPreviews.set(stepIdx, blobUrl)
  setStepImagePreviews(newPreviews)
  
  // Remove from deleted set if it was marked for deletion
  const newDeleted = new Map(stepImageDeleted)
  newDeleted.delete(stepIdx)
  setStepImageDeleted(newDeleted)
}
```

- [ ] **Step 2: Add handleStepImageDelete handler**

Add this function after `handleStepImageChange()`:

```typescript
const handleStepImageDelete = (stepIdx: number) => {
  // Revoke blob URL if it's a pending upload
  const preview = stepImagePreviews.get(stepIdx)
  if (preview?.startsWith('blob:')) {
    URL.revokeObjectURL(preview)
  }
  
  // Mark as deleted
  const newDeleted = new Map(stepImageDeleted)
  newDeleted.set(stepIdx, true)
  setStepImageDeleted(newDeleted)
  
  // Clear file and preview
  const newFiles = new Map(stepImageFiles)
  newFiles.delete(stepIdx)
  setStepImageFiles(newFiles)
  
  const newPreviews = new Map(stepImagePreviews)
  newPreviews.delete(stepIdx)
  setStepImagePreviews(newPreviews)
}
```

- [ ] **Step 3: Add handleStepImageUndo handler**

Add this function after `handleStepImageDelete()`:

```typescript
const handleStepImageUndo = (stepIdx: number, step: Step) => {
  // Restore from existing step image
  if (step.step_image_filename) {
    const newPreviews = new Map(stepImagePreviews)
    newPreviews.set(stepIdx, getStepImageUrl(recipe.id, step.step_image_filename))
    setStepImagePreviews(newPreviews)
  }
  
  // Remove from deleted set
  const newDeleted = new Map(stepImageDeleted)
  newDeleted.delete(stepIdx)
  setStepImageDeleted(newDeleted)
}
```

- [ ] **Step 4: Commit handler functions**

```bash
git add frontend/src/pages/RecipeDetailPage.tsx
git commit -m "feat: add step image file selection and deletion handlers"
```

---

## Task 5: Add Step Picture UI Section to Edit Panel

**Files:**
- Modify: `frontend/src/pages/RecipeDetailPage.tsx:592-614`

**Context:** Inside the steps edit section (where we edit step text), add the step picture UI with three states: empty placeholder, existing thumbnail, or marked for deletion.

- [ ] **Step 1: Find the steps edit section**

Locate the steps section in the edit panel (around line 592-614). It currently looks like:

```typescript
{/* Steps */}
<div>
  <p className={`${labelCls} mb-3`}>Anleitung</p>
  <div className="space-y-3">
    {editDraft.steps.map((step, idx) => (
      // step editing UI here
    ))}
  </div>
</div>
```

- [ ] **Step 2: Add step picture UI inside the step map**

Inside the `.map()` callback, after the time_minutes input (line 602-603), add this step picture section:

```typescript
{/* Step Picture */}
<div className="mt-2">
  <p className={`${labelCls} mb-2`}>Schritt-Bild</p>
  {stepImageDeleted.get(idx) ? (
    // State 4: Marked for deletion
    <div className="flex items-center gap-2">
      <div 
        className="h-[67px] w-[120px] flex-shrink-0 rounded-lg bg-[var(--mx-surface-container)] opacity-50"
        style={{ aspectRatio: '16/9' }}
      />
      <button
        type="button"
        onClick={() => handleStepImageUndo(idx, recipe.steps[idx])}
        className="text-xs font-semibold text-[var(--mx-primary)] hover:underline"
      >
        Rückgängig
      </button>
    </div>
  ) : stepImagePreviews.get(idx) ? (
    // State 2 & 3: Existing or new preview
    <div className="relative inline-block">
      <img
        src={stepImagePreviews.get(idx)!}
        alt="Schritt Vorschau"
        className="h-[67px] w-[120px] rounded-lg object-cover"
        style={{ aspectRatio: '16/9' }}
      />
      <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-lg bg-black/40 opacity-0 hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => stepImageFileInputRefs.current[idx]?.click()}
          className="flex items-center gap-1 rounded-full bg-[var(--mx-primary)] px-3 py-1.5 text-xs font-bold text-[var(--mx-on-primary)] hover:bg-[var(--mx-primary-dim)] transition-colors"
        >
          <span className="material-symbols-outlined text-[14px]">edit</span>
          Ändern
        </button>
        <button
          type="button"
          onClick={() => handleStepImageDelete(idx)}
          className="flex items-center gap-1 rounded-full bg-red-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-600 transition-colors"
        >
          <span className="material-symbols-outlined text-[14px]">delete</span>
        </button>
      </div>
    </div>
  ) : (
    // State 1: Empty placeholder
    <div className="flex flex-col items-center gap-2">
      <div 
        className="h-[67px] w-[120px] rounded-lg bg-[var(--mx-surface-container)] border-2 border-dashed border-[var(--mx-outline-variant)]"
        style={{ aspectRatio: '16/9' }}
      />
      <button
        type="button"
        onClick={() => stepImageFileInputRefs.current[idx]?.click()}
        className="flex items-center gap-1.5 rounded-full border border-dashed border-[var(--mx-outline-variant)] px-3 py-1.5 text-xs font-bold text-[var(--mx-on-surface-variant)] hover:border-[var(--mx-primary)] hover:text-[var(--mx-primary)] transition-colors"
      >
        <span className="material-symbols-outlined text-[14px]">add_a_photo</span>
        Bild hinzufügen
      </button>
    </div>
  )}
  <input
    ref={(el) => {
      if (el) stepImageFileInputRefs.current[idx] = el
    }}
    type="file"
    accept="image/*"
    onChange={(e) => handleStepImageChange(idx, e)}
    className="hidden"
  />
</div>
```

- [ ] **Step 3: Commit UI changes**

```bash
git add frontend/src/pages/RecipeDetailPage.tsx
git commit -m "feat: add step picture UI with three states (empty, existing, deleted)"
```

---

## Task 6: Implement Step Image Upload in saveEdit Mutation

**Files:**
- Modify: `frontend/src/pages/RecipeDetailPage.tsx:249-265`

**Context:** Update the `updateMutation` to handle step image uploads after recipe metadata is saved. Upload all pending images, then refetch to display final state.

- [ ] **Step 1: Create helper function to upload step images**

Add this function before the `RecipeDetailPage` component definition (around line 200):

```typescript
async function uploadStepImages(
  recipeId: string,
  stepImageFiles: Map<number, File>,
  stepImageDeleted: Map<number, boolean>,
  recipe: RecipeDetail,
): Promise<void> {
  // Upload new step images
  for (const [stepIdx, file] of stepImageFiles) {
    const step = recipe.steps[stepIdx]
    if (!step) continue
    try {
      await uploadStepImage(recipeId, step.id, file)
    } catch (error) {
      console.error(`Failed to upload image for step ${stepIdx + 1}:`, error)
      // Don't throw - allow other uploads to continue
    }
  }
  
  // Delete step images marked for deletion
  for (const [stepIdx, isDeleted] of stepImageDeleted) {
    if (!isDeleted) continue
    const step = recipe.steps[stepIdx]
    if (!step) continue
    try {
      await deleteStepImage(recipeId, step.id)
    } catch (error) {
      console.error(`Failed to delete image for step ${stepIdx + 1}:`, error)
      // Don't throw - allow other deletes to continue
    }
  }
}
```

- [ ] **Step 2: Update updateMutation to call uploadStepImages**

Find the `updateMutation` definition (around line 249) and update the `onSuccess` callback:

```typescript
const updateMutation = useMutation({
  mutationFn: ({ id, data }: { id: string; data: RecipeUpdateRequest }) => updateRecipe(id, data),
  onSuccess: async () => {
    // Upload pending recipe image first
    if (pendingImageFile && recipeId) {
      try {
        await uploadRecipeImage(recipeId, pendingImageFile)
      } catch {
        // Ignore image upload errors - recipe is still saved
      }
      setPendingImageFile(null)
      setImagePreviewUrl(null)
    }
    
    // Upload step images (new and deleted)
    if (recipeId && (stepImageFiles.size > 0 || stepImageDeleted.size > 0)) {
      try {
        // Refetch recipe first to get fresh step IDs
        const freshRecipe = await getRecipe(recipeId)
        await uploadStepImages(recipeId, stepImageFiles, stepImageDeleted, freshRecipe)
      } catch (error) {
        console.error('Step image upload failed:', error)
      }
      
      // Revoke blob URLs
      stepImagePreviews.forEach((url) => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url)
        }
      })
      
      // Clear step image state
      setStepImageFiles(new Map())
      setStepImagePreviews(new Map())
      setStepImageDeleted(new Map())
    }
    
    await recipeQuery.refetch()
    queryClient.invalidateQueries({ queryKey: ['recipes'] })
    setIsEditMode(false)
    setEditDraft(null)
  },
})
```

- [ ] **Step 3: Commit upload logic**

```bash
git add frontend/src/pages/RecipeDetailPage.tsx
git commit -m "feat: implement step image upload and deletion on recipe save"
```

---

## Task 7: Manual Testing in Dev Server

**Files:**
- Test: `frontend/` (local browser testing)

**Context:** Test all step picture states and workflows in the browser with a running dev server.

- [ ] **Step 1: Start the dev server**

```bash
cd frontend
npm run dev
```

Expected: Server starts on `http://localhost:5173`

- [ ] **Step 2: Open recipe in browser and enter edit mode**

Navigate to a recipe detail page, click "Bearbeiten" button.

Expected: Edit panel opens, steps display with empty placeholders (or existing step images if the recipe has them).

- [ ] **Step 3: Test adding picture to empty step**

Click "Bild hinzufügen" on an empty step, select an image file.

Expected: Thumbnail appears immediately with "Ändern" and "Löschen" buttons overlay.

- [ ] **Step 4: Test changing picture**

Click "Ändern" on the thumbnail, select a different image.

Expected: Old preview replaced with new one immediately.

- [ ] **Step 5: Test deleting picture**

Click "Löschen" on the thumbnail.

Expected: Placeholder fades, "Rückgängig" button appears.

- [ ] **Step 6: Test undo delete**

Click "Rückgängig" on faded placeholder.

Expected: Original picture thumbnail restored with "Ändern" and "Löschen" buttons.

- [ ] **Step 7: Test cancel edit mode**

With multiple step images added/deleted, click "Abbrechen".

Expected: Edit mode closes, page shows original recipe state. No blobs remain (check DevTools if needed).

- [ ] **Step 8: Test save with multiple step images**

Add pictures to 2-3 steps, save recipe.

Expected: 
- Recipe metadata saves
- Step image uploads happen sequentially (check Network tab in DevTools)
- Recipe refetches and thumbnails display
- Edit mode closes

- [ ] **Step 9: Test delete step image and save**

Edit recipe, delete a step image, save.

Expected:
- DELETE request sent for that step
- Recipe refetches without the image
- Placeholder shows on reload

- [ ] **Step 10: Test upload failure handling**

Manually break the API (e.g., restart backend) during step image upload.

Expected:
- Error logged to console
- Recipe still saved
- Other step images continue uploading
- User can retry by re-editing

---

## Summary of Changes

**API Functions Added:**
- `uploadStepImage(recipeId, stepId, file)` - POST request to upload step image
- `deleteStepImage(recipeId, stepId)` - DELETE request to remove step image

**State Management Added:**
- `stepImageFiles` - Map of pending file uploads
- `stepImagePreviews` - Map of preview URLs (blob or existing)
- `stepImageDeleted` - Map of deletion flags
- `stepImageFileInputRefs` - Ref object for hidden file inputs per step

**Handlers Added:**
- `handleStepImageChange()` - File selection with instant preview
- `handleStepImageDelete()` - Mark image for deletion
- `handleStepImageUndo()` - Restore deleted image

**Upload Helper:**
- `uploadStepImages()` - Sequential upload of all pending and deleted images

**UI Changes:**
- Step picture section in edit panel with three states
- Thumbnail with overlay buttons (change/delete)
- Empty placeholder with add button
- Faded placeholder with undo button

**Cleanup:**
- Blob URL revocation on cancel, save, and upload
- Step image state reset on edit mode exit
