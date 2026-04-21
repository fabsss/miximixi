import { render, screen, fireEvent } from '@testing-library/react'
import { useEffect } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { TimerOverlay } from './TimerOverlay'
import { TimerProvider, useTimers } from '../context/TimerContext'

// Scaffold helpers

function SingleTimerScaffold({ onClose = vi.fn() }: { onClose?: () => void }) {
  const { startTimer } = useTimers()
  useEffect(() => {
    startTimer('r1', 0, 'Pasta kochen', 'Spaghetti', 300)
  }, [startTimer])
  return <TimerOverlay open={true} onClose={onClose} />
}

function TwoRecipeScaffold({ onClose = vi.fn() }: { onClose?: () => void }) {
  const { startTimer } = useTimers()
  useEffect(() => {
    startTimer('r1', 0, 'Step 1', 'Spaghetti', 300)
    startTimer('r2', 0, 'Step 1', 'Risotto', 180)
  }, [startTimer])
  return <TimerOverlay open={true} onClose={onClose} />
}

describe('TimerOverlay', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <TimerProvider>
        <TimerOverlay open={false} onClose={vi.fn()} />
      </TimerProvider>
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows "Laufende Timer" heading when open with timers', async () => {
    render(
      <TimerProvider>
        <SingleTimerScaffold />
      </TimerProvider>
    )
    expect(await screen.findByText('Laufende Timer')).toBeInTheDocument()
  })

  it('groups timers by recipe title — two recipes show two headings', async () => {
    render(
      <TimerProvider>
        <TwoRecipeScaffold />
      </TimerProvider>
    )
    expect(await screen.findByText('Spaghetti')).toBeInTheDocument()
    expect(screen.getByText('Risotto')).toBeInTheDocument()
  })

  it('shows step label on timer card', async () => {
    render(
      <TimerProvider>
        <SingleTimerScaffold />
      </TimerProvider>
    )
    expect(await screen.findByText('Pasta kochen')).toBeInTheDocument()
  })

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn()
    render(
      <TimerProvider>
        <SingleTimerScaffold onClose={onClose} />
      </TimerProvider>
    )
    // Wait for overlay to be rendered
    await screen.findByText('Laufende Timer')
    const backdrop = document.querySelector('.z-40')
    expect(backdrop).not.toBeNull()
    fireEvent.click(backdrop!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape key is pressed', async () => {
    const onClose = vi.fn()
    render(
      <TimerProvider>
        <SingleTimerScaffold onClose={onClose} />
      </TimerProvider>
    )
    await screen.findByText('Laufende Timer')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('deletes a timer when the "Timer löschen" button is clicked', async () => {
    render(
      <TimerProvider>
        <SingleTimerScaffold />
      </TimerProvider>
    )
    await screen.findByText('Pasta kochen')
    const deleteBtn = screen.getByRole('button', { name: 'Timer löschen' })
    fireEvent.click(deleteBtn)
    // After deletion the step label should disappear
    expect(screen.queryByText('Pasta kochen')).not.toBeInTheDocument()
  })
})
