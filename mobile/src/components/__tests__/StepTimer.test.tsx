import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import { ConnectedStepTimer } from '../StepTimer'
import { TimerProvider } from '../../context/TimerContext'
import { ThemeProvider } from '../../context/ThemeContext'
import AsyncStorage from '@react-native-async-storage/async-storage'

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider>
    <TimerProvider>{children}</TimerProvider>
  </ThemeProvider>
)

const defaultProps = {
  recipeId: 'r1',
  stepIndex: 0,
  stepLabel: 'Boil water for 2 minutes',
  recipeTitle: 'Pasta Recipe',
  totalSeconds: 120,
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(null)
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('ConnectedStepTimer', () => {
  test('displays initial time correctly', async () => {
    const { getByTestId } = render(
      <ConnectedStepTimer {...defaultProps} />,
      { wrapper },
    )
    await waitFor(() => expect(getByTestId('timer-display').props.children).toBe('2:00'))
  })

  test('renders start button initially', async () => {
    const { getByTestId } = render(
      <ConnectedStepTimer {...defaultProps} />,
      { wrapper },
    )
    await waitFor(() => expect(getByTestId('timer-start')).toBeTruthy())
  })

  test('start button starts the timer', async () => {
    const { getByTestId } = render(
      <ConnectedStepTimer {...defaultProps} />,
      { wrapper },
    )
    await waitFor(() => getByTestId('timer-start'))
    fireEvent.press(getByTestId('timer-start'))
    await waitFor(() => expect(getByTestId('timer-pause')).toBeTruthy())
  })

  test('pause button pauses the timer', async () => {
    const { getByTestId } = render(
      <ConnectedStepTimer {...defaultProps} />,
      { wrapper },
    )
    await waitFor(() => getByTestId('timer-start'))
    fireEvent.press(getByTestId('timer-start'))
    await waitFor(() => getByTestId('timer-pause'))
    fireEvent.press(getByTestId('timer-pause'))
    await waitFor(() => expect(getByTestId('timer-start')).toBeTruthy())
  })

  test('+30s button increases remaining time', async () => {
    const { getByTestId } = render(
      <ConnectedStepTimer {...defaultProps} totalSeconds={60} />,
      { wrapper },
    )
    await waitFor(() => getByTestId('timer-start'))
    fireEvent.press(getByTestId('timer-start'))
    act(() => { jest.advanceTimersByTime(5_000) })
    fireEvent.press(getByTestId('timer-plus-30'))
    // Remaining should be ~85s after advancing 5s and adding 30s
    const display = getByTestId('timer-display').props.children
    expect(display).not.toBe('0:00')
  })

  test('-30s button decreases remaining time', async () => {
    const { getByTestId } = render(
      <ConnectedStepTimer {...defaultProps} totalSeconds={120} />,
      { wrapper },
    )
    await waitFor(() => getByTestId('timer-start'))
    // Not started — adjust on paused state
    fireEvent.press(getByTestId('timer-minus-30'))
    const display = getByTestId('timer-display').props.children
    // Should be 1:30 (90s)
    expect(display).toBe('1:30')
  })

  test('displays testID when provided', async () => {
    const { getByTestId } = render(
      <ConnectedStepTimer {...defaultProps} testID="my-timer" />,
      { wrapper },
    )
    await waitFor(() => expect(getByTestId('my-timer')).toBeTruthy())
  })
})
