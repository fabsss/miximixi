import { useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getTagsWithCounts, mergeTags } from '../lib/api'

export function TagsPage(): ReactNode {
  const queryClient = useQueryClient()
  const tagsQuery = useQuery({
    queryKey: ['tagsWithCounts'],
    queryFn: () => getTagsWithCounts(),
  })

  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [targetTag, setTargetTag] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  const tags = tagsQuery.data ?? []

  const handleToggleTag = (tag: string) => {
    const newSelected = new Set(selectedTags)
    if (newSelected.has(tag)) {
      newSelected.delete(tag)
    } else {
      newSelected.add(tag)
    }
    setSelectedTags(newSelected)

    if (newSelected.size > 0 && !targetTag) {
      setTargetTag(Array.from(newSelected)[0])
    }
  }

  const handleMergeTags = async () => {
    if (selectedTags.size === 0 || !targetTag.trim()) return

    setIsLoading(true)
    setMessage(null)

    try {
      const result = await mergeTags(Array.from(selectedTags), targetTag)
      setMessage({
        type: 'success',
        text: `${result.updated_recipes} Rezept${result.updated_recipes !== 1 ? 'e' : ''} aktualisiert`,
      })
      setSelectedTags(new Set())
      setTargetTag('')
      queryClient.invalidateQueries({ queryKey: ['tagsWithCounts'] })
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Fehler beim Zusammenführen: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteTag = async (tag: string) => {
    if (!confirm(`Tag "${tag}" wirklich löschen?`)) return

    setIsLoading(true)
    setMessage(null)

    try {
      const result = await mergeTags([tag], '')
      setMessage({
        type: 'success',
        text: `Tag gelöscht aus ${result.updated_recipes} Rezept${result.updated_recipes !== 1 ? 'en' : ''}`,
      })
      setSelectedTags(new Set())
      setTargetTag('')
      queryClient.invalidateQueries({ queryKey: ['tagsWithCounts'] })
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Fehler beim Löschen: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`,
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="mx-shell py-8 pb-32">
      <h1 className="mb-8 text-2xl font-bold">Tags verwalten</h1>

      {tagsQuery.isLoading && <p className="text-center text-[var(--mx-on-surface-variant)]">Lade Tags...</p>}

      {tagsQuery.error && (
        <div className="rounded-[2rem] bg-red-100/70 p-10 text-center text-red-800">
          Tags konnten nicht geladen werden
        </div>
      )}

      {!tagsQuery.isLoading && !tagsQuery.error && (
        <>
          <div className="flex flex-wrap gap-2 mb-8">
            {tags.map(({ tag, count }) => (
              <div
                key={tag}
                className={`group relative flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition cursor-pointer ${
                  selectedTags.has(tag)
                    ? 'bg-[var(--mx-secondary-container)] text-[var(--mx-secondary)]'
                    : 'bg-[var(--mx-surface-container)] text-[var(--mx-on-surface-variant)] hover:text-[var(--mx-on-surface)]'
                }`}
                onClick={() => handleToggleTag(tag)}
              >
                <span>{tag}</span>
                <span className="text-xs opacity-70">{count}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteTag(tag)
                  }}
                  disabled={isLoading}
                  className="ml-1 rounded-full p-0.5 transition hover:bg-[var(--mx-surface-low)] disabled:opacity-50"
                  title="Tag löschen"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>
            ))}
          </div>

          {message && (
            <div
              className={`mb-8 rounded-[2rem] p-4 text-center text-sm ${
                message.type === 'success'
                  ? 'bg-green-100/70 text-green-800'
                  : 'bg-red-100/70 text-red-800'
              }`}
            >
              {message.text}
            </div>
          )}

          {selectedTags.size > 0 && (
            <div className="fixed bottom-0 left-0 right-0 border-t border-[var(--mx-outline-variant)] bg-[var(--mx-surface)] px-4 py-4">
              <div className="mx-shell flex flex-col gap-3">
                <p className="text-sm font-semibold text-[var(--mx-on-surface)]">
                  {selectedTags.size === 1
                    ? 'Tag umbenennen'
                    : `${selectedTags.size} Tags zusammenführen`}
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={targetTag}
                    onChange={(e) => setTargetTag(e.target.value)}
                    placeholder="Neuer Tag-Name"
                    className="flex-1 rounded-full border border-[var(--mx-outline-variant)] bg-[var(--mx-surface-low)] px-4 py-2 text-sm text-[var(--mx-on-surface)] placeholder-[var(--mx-on-surface-variant)] outline-none focus:border-[var(--mx-primary)]"
                  />
                  <button
                    onClick={handleMergeTags}
                    disabled={isLoading || !targetTag.trim()}
                    className="rounded-full bg-[var(--mx-primary)] px-6 py-2 text-sm font-semibold text-[var(--mx-on-primary)] transition disabled:opacity-50"
                  >
                    {isLoading ? 'Lädt...' : 'Zusammenführen'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
