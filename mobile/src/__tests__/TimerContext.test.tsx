import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Audio } from 'expo-av'
import { TimerProvider, useTimers } from '../context/TimerContext'
import { TIMERS_KEY } from '@miximixi/shared/constants'

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

describe('TimerContext — initialization', () => {
  test('starts with empty timers and hydrated=false initially', async () => {
    const { result } = renderHook(() => useTimers(), { wrapper })
    // Initially hydrated is false (before AsyncStorage loads)
    await waitFor(() => expect(result.current.hydrated).toBe(true))
    expect(result.current.timers.size).toBe(0)
  })

  test('hydrates from AsyncStorage on mount', async () => {
    const savedTimer = {
      id: 'r1:0',
      recipeId: 'r1',
      recipeTitle: 'Pasta',
      stepIndex: 0,
      stepLabel: 'Boil water',
      totalSeconds: 300,
      isRunning: false,
      isDone: false,
      deadlineMs: null,
      pausedRemaining: 300,
    }
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify([['r1:0', savedTimer]])
    )
    const { result } = renderHook(() => useTimers(), { wrapper })
    await waitFor(() => expect(result.current.hydrated).toBe(true))
    expect(result.current.timers.get('r1:0')).toBeDefined()
    expect(result.current.timers.get('r1:0')?.recipeTitle).toBe('Pasta')
  })
})

describe('TimerContext — startTimer', () => {
  test('creates new timer with correct deadline', async () => {
    const now = Date.now()
    const { result } = renderHook(() => useTimers(), { wrapper })
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    act(() => {
      result.current.startTimer('recipe1', 0, 'Boil water', 'Pasta', 120)
    })

    const timer = result.current.timers.get('recipe1:0')
    expect(timer).toBeDefined()
    expect(timer?.isRunning).toBe(true)
    expect(timer?.totalSeconds).toBe(120)
    expect(timer?.deadlineMs).toBeGreaterThanOrEqual(now + 119_000)
  })

  test('persists timer to AsyncStorage', async () => {
    const { result } = renderHook(() => useTimers(), { wrapper })
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    act(() => {
      result.current.startTimer('recipe1', 0, 'Step', 'Recipe', 60)
    })

    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      TIMERS_KEY,
      expect.any(String),
    ))
  })
})

describe('TimerContext — pause / resume', () => {
  test('pause freezes remaining seconds', async () => {
    const { result } = renderHook(() => useTimers(), { wrapper })
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    act(() => { result.current.startTimer('r', 0, 'Step', 'R', 100) })
    // Advance 10 seconds
    act(() => { jest.advanceTimersByTime(10_000) })
    act(() => { result.current.pauseTimer('r:0') })

    const timer = result.current.timers.get('r:0')!
    expect(timer.isRunning).toBe(false)
    expect(timer.pausedRemaining).toBeGreaterThan(0)
    expect(timer.deadlineMs).toBeNull()
  })

  test('resume restores running state with correct deadline', async () => {
    const { result } = renderHook(() => useTimers(), { wrapper })
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    act(() => { result.current.startTimer('r', 0, 'Step', 'R', 100) })
    act(() => { jest.advanceTimersByTime(10_000) })
    act(() => { result.current.pauseTimer('r:0') })
    act(() => { result.current.resumeTimer('r:0') })

    const timer = result.current.timers.get('r:0')!
    expect(timer.isRunning).toBe(true)
    expect(timer.deadlineMs).toBeGreaterThan(Date.now())
  })
})

describe('TimerContext — countdown to zero', () => {
  test('marks isDone when deadline reached', async () => {
    const { result } = renderHook(() => useTimers(), { wrapper })
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    act(() => { result.current.startTimer('r', 0, 'Step', 'R', 2) })
    act(() => { jest.advanceTimersByTime(3_000) })

    await waitFor(() => {
      const timer = result.current.timers.get('r:0')
      return timer?.isDone === true
    })
    expect(result.current.timers.get('r:0')?.isDone).toBe(true)
  })

  test('plays bell exactly once when timer completes', async () => {
    const mockReplay = jest.fn().mockResolvedValue(undefined)
    ;(Audio.Sound.createAsync as jest.Mock).mockResolvedValue({
      sound: { replayAsync: mockReplay, unloadAsync: jest.fn() },
    })

    const { result } = renderHook(() => useTimers(), { wrapper })
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    act(() => { result.current.startTimer('r', 0, 'Step', 'R', 1) })
    act(() => { jest.advanceTimersByTime(2_000) })

    await waitFor(() => result.current.timers.get('r:0')?.isDone)
    // Give async sound callback time
    await new Promise(r => setTimeout(r, 50))
    expect(mockReplay).toHaveBeenCalledTimes(1)
  })
})

describe('TimerContext — adjustTimer', () => {
  test('adjustTimer +30 adds 30s to running deadline', async () => {
    const { result } = renderHook(() => useTimers(), { wrapper })
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    act(() => { result.current.startTimer('r', 0, 'Step', 'R', 60) })
    const before = result.current.timers.get('r:0')!.deadlineMs!

    act(() => { result.current.adjustTimer('r:0', 30) })

    const after = result.current.timers.get('r:0')!.deadlineMs!
    expect(after).toBeCloseTo(before + 30_000, -2)
  })

  test('adjustTimer -30 on paused timer updates pausedRemaining', async () => {
    const { result } = renderHook(() => useTimers(), { wrapper })
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    act(() => { result.current.initializeTimer('r', 0, 'Step', 'R', 120) })
    act(() => { result.current.adjustTimer('r:0', -30) })

    expect(result.current.timers.get('r:0')?.pausedRemaining).toBe(90)
  })

  test('adjustTimer cannot go below 0', async () => {
    const { result } = renderHook(() => useTimers(), { wrapper })
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    act(() => { result.current.initializeTimer('r', 0, 'Step', 'R', 10) })
    act(() => { result.current.adjustTimer('r:0', -100) })

    expect(result.current.timers.get('r:0')?.pausedRemaining).toBe(0)
  })
})

describe('TimerContext — getRemainingSeconds', () => {
  test('returns totalSeconds when timer not started', async () => {
    const { result } = renderHook(() => useTimers(), { wrapper })
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    act(() => { result.current.initializeTimer('r', 0, 'Step', 'R', 90) })
    const timer = result.current.timers.get('r:0')!
    expect(result.current.getRemainingSeconds(timer)).toBe(90)
  })

  test('returns pausedRemaining when timer is paused', async () => {
    const { result } = renderHook(() => useTimers(), { wrapper })
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    act(() => { result.current.startTimer('r', 0, 'Step', 'R', 60) })
    act(() => { result.current.pauseTimer('r:0') })

    const timer = result.current.timers.get('r:0')!
    expect(timer.isRunning).toBe(false)
    expect(result.current.getRemainingSeconds(timer)).toBeGreaterThan(0)
  })
})
