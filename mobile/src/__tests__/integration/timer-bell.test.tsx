import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react-native'
import { Audio } from 'expo-av'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { TimerProvider, useTimers } from '../../context/TimerContext'

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <TimerProvider>{children}</TimerProvider>
)

beforeEach(() => {
  jest.clearAllMocks()
  ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(null)
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('Timer bell integration', () => {
  test('bell fires exactly once when timer reaches 0', async () => {
    const mockReplay = jest.fn().mockResolvedValue(undefined)
    ;(Audio.Sound.createAsync as jest.Mock).mockResolvedValue({
      sound: { replayAsync: mockReplay, unloadAsync: jest.fn().mockResolvedValue(undefined) },
    })

    const { result } = renderHook(() => useTimers(), { wrapper })
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    act(() => { result.current.startTimer('r', 0, 'Step', 'Recipe', 2) })

    // Advance past deadline
    act(() => { jest.advanceTimersByTime(3_000) })

    await waitFor(() => result.current.timers.get('r:0')?.isDone === true)

    expect(mockReplay).toHaveBeenCalledTimes(1)
  })

  test('bell does NOT fire a second time if timer is already done', async () => {
    const mockReplay = jest.fn().mockResolvedValue(undefined)
    ;(Audio.Sound.createAsync as jest.Mock).mockResolvedValue({
      sound: { replayAsync: mockReplay, unloadAsync: jest.fn().mockResolvedValue(undefined) },
    })

    const { result } = renderHook(() => useTimers(), { wrapper })
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    act(() => { result.current.startTimer('r', 0, 'Step', 'Recipe', 1) })
    act(() => { jest.advanceTimersByTime(2_000) })
    await waitFor(() => result.current.timers.get('r:0')?.isDone === true)
    // Keep advancing — bell should not fire again
    act(() => { jest.advanceTimersByTime(5_000) })

    expect(mockReplay).toHaveBeenCalledTimes(1)
  })

  test('multiple timers fire their bells independently', async () => {
    const mockReplay = jest.fn().mockResolvedValue(undefined)
    ;(Audio.Sound.createAsync as jest.Mock).mockResolvedValue({
      sound: { replayAsync: mockReplay, unloadAsync: jest.fn().mockResolvedValue(undefined) },
    })

    const { result } = renderHook(() => useTimers(), { wrapper })
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    act(() => {
      result.current.startTimer('r', 0, 'S1', 'R', 1)
      result.current.startTimer('r', 1, 'S2', 'R', 2)
    })

    act(() => { jest.advanceTimersByTime(1_500) })
    await waitFor(() => result.current.timers.get('r:0')?.isDone === true)
    // First timer done
    expect(mockReplay).toHaveBeenCalledTimes(1)

    act(() => { jest.advanceTimersByTime(1_500) })
    await waitFor(() => result.current.timers.get('r:1')?.isDone === true)
    // Second timer done
    expect(mockReplay).toHaveBeenCalledTimes(2)
  })
})
