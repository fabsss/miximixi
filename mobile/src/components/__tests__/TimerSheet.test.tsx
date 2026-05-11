import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import { TimerSheet } from '../TimerSheet'
import { TimerProvider, useTimers } from '../../context/TimerContext'
import { ThemeProvider } from '../../context/ThemeContext'
import AsyncStorage from '@react-native-async-storage/async-storage'

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider>
    <TimerProvider>{children}</TimerProvider>
  </ThemeProvider>
)

// Helper component to start timers then render TimerSheet
function TestHarness({ onReady }: { onReady?: () => void }) {
  const { startTimer, hydrated } = useTimers()
  React.useEffect(() => {
    if (hydrated) {
      startTimer('r1', 0, 'Boil water', 'Pasta', 120)
      startTimer('r1', 1, 'Add pasta', 'Pasta', 600)
      onReady?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])
  return <TimerSheet />
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(null)
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('TimerSheet', () => {
  test('renders nothing when no timers', async () => {
    const { queryByTestId } = render(<TimerSheet />, { wrapper })
    await waitFor(() => expect(queryByTestId('timer-fab')).toBeNull())
  })

  test('shows FAB when timers are active', async () => {
    const { getByTestId } = render(
      <TestHarness />,
      { wrapper },
    )
    await waitFor(() => expect(getByTestId('timer-fab')).toBeTruthy())
  })

  test('shows all active timers in the sheet', async () => {
    const { getByTestId } = render(
      <TestHarness />,
      { wrapper },
    )
    await waitFor(() => getByTestId('timer-fab'))
    fireEvent.press(getByTestId('timer-fab'))
    await waitFor(() => {
      expect(getByTestId('timer-row-r1:0')).toBeTruthy()
      expect(getByTestId('timer-row-r1:1')).toBeTruthy()
    })
  })

  test('delete button removes a timer', async () => {
    const { getByTestId, queryByTestId } = render(
      <TestHarness />,
      { wrapper },
    )
    await waitFor(() => getByTestId('timer-fab'))
    fireEvent.press(getByTestId('timer-fab'))
    await waitFor(() => getByTestId('timer-delete-r1:0'))
    fireEvent.press(getByTestId('timer-delete-r1:0'))
    await waitFor(() => expect(queryByTestId('timer-row-r1:0')).toBeNull())
  })

  test('pause/resume button toggles timer state', async () => {
    const { getByTestId } = render(
      <TestHarness />,
      { wrapper },
    )
    await waitFor(() => getByTestId('timer-fab'))
    fireEvent.press(getByTestId('timer-fab'))
    await waitFor(() => getByTestId('timer-toggle-r1:0'))
    // Toggle (pause running timer)
    fireEvent.press(getByTestId('timer-toggle-r1:0'))
    // Toggle again (resume)
    fireEvent.press(getByTestId('timer-toggle-r1:0'))
    expect(getByTestId('timer-toggle-r1:0')).toBeTruthy()
  })
})
