import { render, screen, fireEvent } from '@testing-library/react'
import { useEffect } from 'react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { GlobalTimerButton } from './GlobalTimerButton'

// ---------------------------------------------------------------------------
// Module mock
// The mock intercepts useTimers and delegates to an overrideable spy function.
// ---------------------------------------------------------------------------

vi.mock('../context/TimerContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../context/TimerContext')>()
  return {
    ...actual,
    // Re-export useTimers pointing to the real function; tests can spy on it.
    useTimers: actual.useTimers,
  }
})

import * as TimerContextModule from '../context/TimerContext'
const { TimerProvider, useTimers } = TimerContextModule

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderEmpty(onClick = vi.fn()) {
  return render(
    <TimerProvider>
      <GlobalTimerButton onClick={onClick} />
    </TimerProvider>
  )
}

function WithTimers({
  count,
  onClick = vi.fn(),
}: {
  count: number
  onClick?: () => void
}) {
  const { startTimer } = useTimers()
  useEffect(() => {
    for (let i = 0; i < count; i++) {
      startTimer('recipe1', i, `Step ${i + 1}`, 'Recipe', 3600)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <GlobalTimerButton onClick={onClick} />
}

// ---------------------------------------------------------------------------
// Tests — real TimerProvider
// ---------------------------------------------------------------------------

describe('GlobalTimerButton', () => {
  it('renders nothing when no timers exist', () => {
    const { container } = renderEmpty()
    expect(container.firstChild).toBeNull()
  })

  it('renders a button when timers exist', async () => {
    render(
      <TimerProvider>
        <WithTimers count={1} />
      </TimerProvider>
    )
    const btn = await screen.findByRole('button')
    expect(btn).toBeTruthy()
  })

  it('aria-label reflects timer count', async () => {
    render(
      <TimerProvider>
        <WithTimers count={3} />
      </TimerProvider>
    )
    const btn = await screen.findByRole('button', { name: /3 laufende Timer/i })
    expect(btn).toBeTruthy()
  })

  it('badge span shows the timer count', async () => {
    render(
      <TimerProvider>
        <WithTimers count={2} />
      </TimerProvider>
    )
    await screen.findByRole('button')
    const badge = screen.getByText('2')
    expect(badge).toBeTruthy()
  })

  it('calls onClick when the button is clicked', async () => {
    const onClick = vi.fn()
    render(
      <TimerProvider>
        <WithTimers count={1} onClick={onClick} />
      </TimerProvider>
    )
    const btn = await screen.findByRole('button')
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// isDone / animate-pulse — spy on useTimers to inject a done timer
// ---------------------------------------------------------------------------

describe('GlobalTimerButton — isDone pulse', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('applies animate-pulse class to icon when any timer isDone', () => {
    const doneTimer = {
      id: 'r1:0',
      recipeId: 'r1',
      recipeTitle: 'Recipe',
      stepIndex: 0,
      stepLabel: 'Step 1',
      totalSeconds: 60,
      remainingSeconds: 0,
      isRunning: false,
      isDone: true,
      startedAt: null,
    }
    vi.spyOn(TimerContextModule, 'useTimers').mockReturnValue({
      timers: new Map([['r1:0', doneTimer]]),
      startTimer: vi.fn(),
      pauseTimer: vi.fn(),
      resumeTimer: vi.fn(),
      resetTimer: vi.fn(),
      deleteTimer: vi.fn(),
      adjustTimer: vi.fn(),
    })

    render(<GlobalTimerButton onClick={vi.fn()} />)
    const icon = screen.getByText('timer')
    expect(icon.className).toContain('animate-pulse')
  })
})
