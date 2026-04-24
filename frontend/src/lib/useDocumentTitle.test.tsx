import { describe, it, expect, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { useDocumentTitle } from './useDocumentTitle'

function TitleComponent({ title }: { title: string }) {
  useDocumentTitle(title)
  return null
}

describe('useDocumentTitle', () => {
  afterEach(() => {
    document.title = 'Miximixi'
  })

  it('sets document.title on mount', () => {
    render(<TitleComponent title="Miximixi - Entdecken" />)
    expect(document.title).toBe('Miximixi - Entdecken')
  })

  it('updates document.title when title changes', () => {
    const { rerender } = render(<TitleComponent title="Miximixi - Entdecken" />)
    expect(document.title).toBe('Miximixi - Entdecken')
    rerender(<TitleComponent title="Miximixi - Rhabarberkuchen" />)
    expect(document.title).toBe('Miximixi - Rhabarberkuchen')
  })

  it('resets document.title to Miximixi on unmount', () => {
    const { unmount } = render(<TitleComponent title="Miximixi - Tags" />)
    unmount()
    expect(document.title).toBe('Miximixi')
  })
})
