import { act, renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TimerProvider, useTimers } from './TimerContext'

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <TimerProvider>{children}</TimerProvider>
)

describe('TimerContext', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with no timers', () => {
    const { result } = renderHook(() => useTimers(), { wrapper })
    expect(result.current.timers.size).toBe(0)
  })

  it('startTimer creates a new running timer', () => {
    const { result } = renderHook(() => useTimers(), { wrapper })
    act(() => {
      result.current.startTimer('recipe1', 0, 'Schritt 1', 'Pasta', 120)
    })
    const timer = result.current.timers.get('recipe1:0')
    expect(timer).toBeDefined()
    expect(timer?.isRunning).toBe(true)
    expect(timer?.remainingSeconds).toBe(120)
    expect(timer?.isDone).toBe(false)
    expect(timer?.recipeTitle).toBe('Pasta')
    expect(timer?.stepLabel).toBe('Schritt 1')
  })

  it('stepLabel is truncated to 30 chars', () => {
    const { result } = renderHook(() => useTimers(), { wrapper })
    act(() => {
      result.current.startTimer('recipe1', 0, 'A'.repeat(40), 'Pasta', 60)
    })
    expect(result.current.timers.get('recipe1:0')?.stepLabel).toHaveLength(30)
  })

  it('timer ticks down every second', () => {
    const { result } = renderHook(() => useTimers(), { wrapper })
    act(() => {
      result.current.startTimer('recipe1', 0, 'Schritt 1', 'Pasta', 120)
    })
    act(() => { vi.advanceTimersByTime(3000) })
    expect(result.current.timers.get('recipe1:0')?.remainingSeconds).toBe(117)
  })

  it('timer continues into negative (overrun)', () => {
    const { result } = renderHook(() => useTimers(), { wrapper })
    act(() => {
      result.current.startTimer('recipe1', 0, 'Schritt 1', 'Pasta', 2)
    })
    act(() => { vi.advanceTimersByTime(5000) })
    expect(result.current.timers.get('recipe1:0')?.remainingSeconds).toBe(-3)
  })

  it('isDone becomes true exactly when crossing 0', () => {
    const { result } = renderHook(() => useTimers(), { wrapper })
    act(() => {
      result.current.startTimer('recipe1', 0, 'Schritt 1', 'Pasta', 2)
    })
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.timers.get('recipe1:0')?.isDone).toBe(false)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.timers.get('recipe1:0')?.isDone).toBe(true)
  })

  it('pauseTimer stops countdown', () => {
    const { result } = renderHook(() => useTimers(), { wrapper })
    act(() => { result.current.startTimer('recipe1', 0, 'Schritt 1', 'Pasta', 60) })
    act(() => { vi.advanceTimersByTime(2000) })
    act(() => { result.current.pauseTimer('recipe1:0') })
    const afterPause = result.current.timers.get('recipe1:0')?.remainingSeconds
    act(() => { vi.advanceTimersByTime(5000) })
    expect(result.current.timers.get('recipe1:0')?.remainingSeconds).toBe(afterPause)
    expect(result.current.timers.get('recipe1:0')?.isRunning).toBe(false)
    expect(result.current.timers.get('recipe1:0')?.startedAt).toBeNull()
  })

  it('resumeTimer restarts countdown', () => {
    const { result } = renderHook(() => useTimers(), { wrapper })
    act(() => { result.current.startTimer('recipe1', 0, 'Schritt 1', 'Pasta', 60) })
    act(() => { vi.advanceTimersByTime(2000) })
    act(() => { result.current.pauseTimer('recipe1:0') })
    act(() => { result.current.resumeTimer('recipe1:0') })
    act(() => { vi.advanceTimersByTime(3000) })
    expect(result.current.timers.get('recipe1:0')?.remainingSeconds).toBe(55)
    expect(result.current.timers.get('recipe1:0')?.isRunning).toBe(true)
  })

  it('resetTimer restores totalSeconds and stops', () => {
    const { result } = renderHook(() => useTimers(), { wrapper })
    act(() => { result.current.startTimer('recipe1', 0, 'Schritt 1', 'Pasta', 60) })
    act(() => { vi.advanceTimersByTime(10000) })
    act(() => { result.current.resetTimer('recipe1:0') })
    const timer = result.current.timers.get('recipe1:0')
    expect(timer?.remainingSeconds).toBe(60)
    expect(timer?.isRunning).toBe(false)
    expect(timer?.isDone).toBe(false)
    expect(timer?.startedAt).toBeNull()
  })

  it('deleteTimer removes the timer', () => {
    const { result } = renderHook(() => useTimers(), { wrapper })
    act(() => { result.current.startTimer('recipe1', 0, 'Schritt 1', 'Pasta', 60) })
    act(() => { result.current.deleteTimer('recipe1:0') })
    expect(result.current.timers.has('recipe1:0')).toBe(false)
  })

  it('adjustTimer adds seconds', () => {
    const { result } = renderHook(() => useTimers(), { wrapper })
    act(() => { result.current.startTimer('recipe1', 0, 'Schritt 1', 'Pasta', 60) })
    act(() => { result.current.adjustTimer('recipe1:0', 60) })
    expect(result.current.timers.get('recipe1:0')?.remainingSeconds).toBe(120)
  })

  it('adjustTimer clamps to 1 when running', () => {
    const { result } = renderHook(() => useTimers(), { wrapper })
    act(() => { result.current.startTimer('recipe1', 0, 'Schritt 1', 'Pasta', 30) })
    act(() => { result.current.adjustTimer('recipe1:0', -9999) })
    expect(result.current.timers.get('recipe1:0')?.remainingSeconds).toBe(1)
  })

  it('adjustTimer clears isDone when remaining becomes positive', () => {
    const { result } = renderHook(() => useTimers(), { wrapper })
    act(() => { result.current.startTimer('recipe1', 0, 'Schritt 1', 'Pasta', 1) })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(result.current.timers.get('recipe1:0')?.isDone).toBe(true)
    act(() => { result.current.pauseTimer('recipe1:0') })
    act(() => { result.current.adjustTimer('recipe1:0', 60) })
    expect(result.current.timers.get('recipe1:0')?.isDone).toBe(false)
  })

  it('multiple timers run independently', () => {
    const { result } = renderHook(() => useTimers(), { wrapper })
    act(() => {
      result.current.startTimer('r1', 0, 'S1', 'Recipe 1', 100)
      result.current.startTimer('r2', 1, 'S2', 'Recipe 2', 200)
    })
    act(() => { vi.advanceTimersByTime(10000) })
    expect(result.current.timers.get('r1:0')?.remainingSeconds).toBe(90)
    expect(result.current.timers.get('r2:1')?.remainingSeconds).toBe(190)
  })

  it('useTimers throws when used outside provider', () => {
    expect(() => renderHook(() => useTimers())).toThrow('useTimers must be used within TimerProvider')
  })
})
