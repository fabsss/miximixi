import { View, Text, Pressable, StyleSheet, FlatList } from 'react-native'
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { useRef, useMemo } from 'react'
import { useTimers, type TimerState } from '../context/TimerContext'
import { MaterialIcon } from './MaterialIcon'
import { useTheme } from '../context/ThemeContext'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

interface TimerRowProps {
  timer: TimerState
}

function TimerRow({ timer }: TimerRowProps) {
  const { colors } = useTheme()
  const { getRemainingSeconds, pauseTimer, resumeTimer, deleteTimer } = useTimers()
  const remaining = getRemainingSeconds(timer)
  const isDone = timer.isDone
  const isRunning = timer.isRunning

  const rowBg = isDone ? colors.primaryContainer : colors.surfaceContainer
  const timeColor = isDone ? colors.primary : colors.onSurface

  return (
    <View style={[styles.timerRow, { backgroundColor: rowBg }]} testID={`timer-row-${timer.id}`}>
      <View style={styles.timerInfo}>
        <Text style={[styles.timerLabel, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
          {timer.recipeTitle} · Step {timer.stepIndex + 1}
        </Text>
        <Text style={[styles.timerTime, { color: timeColor }]}>
          {isDone ? 'Done!' : formatTime(remaining)}
        </Text>
      </View>
      <View style={styles.timerActions}>
        {!isDone && (
          <Pressable
            onPress={() => isRunning ? pauseTimer(timer.id) : resumeTimer(timer.id)}
            style={[styles.actionBtn, { backgroundColor: colors.surfaceVariant }]}
            testID={`timer-toggle-${timer.id}`}
          >
            <MaterialIcon
              name={isRunning ? 'pause' : 'play_arrow'}
              size={18}
              color={colors.onSurface}
            />
          </Pressable>
        )}
        <Pressable
          onPress={() => deleteTimer(timer.id)}
          style={[styles.actionBtn, { backgroundColor: colors.surfaceVariant }]}
          testID={`timer-delete-${timer.id}`}
        >
          <MaterialIcon name="close" size={18} color={colors.onSurfaceVariant} />
        </Pressable>
      </View>
    </View>
  )
}

export function TimerSheet() {
  const { colors } = useTheme()
  const { timers } = useTimers()
  const sheetRef = useRef<BottomSheet>(null)
  const snapPoints = useMemo(() => ['30%', '60%'], [])
  const timerList = [...timers.values()]

  if (timerList.length === 0) return null

  const activeCount = timerList.filter(t => t.isRunning).length

  return (
    <>
      {/* Floating badge button */}
      <Pressable
        onPress={() => sheetRef.current?.expand()}
        style={[styles.fab, { backgroundColor: colors.primary }]}
        testID="timer-fab"
        accessibilityLabel={`${activeCount} active timers`}
      >
        <MaterialIcon name="timer" size={20} color={colors.onPrimary} />
        {activeCount > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.primaryContainer }]}>
            <Text style={[styles.badgeText, { color: colors.primary }]}>{activeCount}</Text>
          </View>
        )}
      </Pressable>

      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: colors.surfaceLow }}
        testID="timer-sheet"
      >
        <BottomSheetScrollView>
          <Text style={[styles.sheetTitle, { color: colors.onSurface }]}>
            Active Timers
          </Text>
          {timerList.map(timer => (
            <TimerRow key={timer.id} timer={timer} />
          ))}
        </BottomSheetScrollView>
      </BottomSheet>
    </>
  )
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 80,
    right: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
  },
  timerInfo: {
    flex: 1,
  },
  timerLabel: {
    fontSize: 12,
    marginBottom: 2,
  },
  timerTime: {
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  timerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
