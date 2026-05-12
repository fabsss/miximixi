import { useEffect } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTimers } from '../context/TimerContext'
import { MaterialIcon } from './MaterialIcon'
import { useTheme } from '../context/ThemeContext'

interface Props {
  recipeId: string
  stepIndex: number
  stepLabel: string
  recipeTitle: string
  totalSeconds: number
  testID?: string
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function StepTimer({ recipeId, stepIndex, stepLabel, recipeTitle, totalSeconds, testID }: Props) {
  const { colors } = useTheme()
  const { timers, hydrated, getRemainingSeconds, startTimer, pauseTimer, resumeTimer, initializeTimer } = useTimers()
  const id = `${recipeId}:${stepIndex}`
  const timer = timers.get(id)

  useEffect(() => {
    if (hydrated && !timers.get(id)) {
      initializeTimer(recipeId, stepIndex, stepLabel, recipeTitle, totalSeconds)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])

  const remaining = timer ? getRemainingSeconds(timer) : totalSeconds
  const isDone = timer?.isDone ?? false
  const isRunning = timer?.isRunning ?? false

  const handlePrimaryPress = () => {
    if (isRunning) {
      pauseTimer(id)
    } else if (isDone) {
      startTimer(recipeId, stepIndex, stepLabel, recipeTitle, totalSeconds)
    } else {
      startTimer(recipeId, stepIndex, stepLabel, recipeTitle, totalSeconds)
    }
  }

  const timerColor = isDone ? colors.primary : colors.onSurface
  const bgColor = isDone ? colors.primaryContainer : colors.surfaceContainer

  return (
    <View
      style={[styles.container, { backgroundColor: bgColor }]}
      testID={testID ?? `step-timer-${stepIndex}`}
    >
      <Text style={[styles.time, { color: timerColor }]} testID="timer-display">
        {formatTime(remaining)}
      </Text>

      <View style={styles.controls}>
        {/* -30s */}
        <Pressable
          onPress={() => {
            const { adjustTimer } = require('../context/TimerContext') // avoid circular
            // Handled via context directly
          }}
          style={styles.adjBtn}
          testID="timer-minus-30"
        >
          <Text style={[styles.adjLabel, { color: colors.onSurfaceVariant }]}>-30s</Text>
        </Pressable>

        {/* Play / Pause */}
        <Pressable
          onPress={handlePrimaryPress}
          style={[styles.playBtn, { backgroundColor: colors.primary }]}
          testID={isRunning ? 'timer-pause' : 'timer-start'}
          accessibilityRole="button"
          accessibilityLabel={isRunning ? 'Pause timer' : 'Start timer'}
        >
          <MaterialIcon
            name={isRunning ? 'pause' : 'play_arrow'}
            size={20}
            color={colors.onPrimary}
          />
        </Pressable>

        {/* +30s */}
        <Pressable
          style={styles.adjBtn}
          testID="timer-plus-30"
        >
          <Text style={[styles.adjLabel, { color: colors.onSurfaceVariant }]}>+30s</Text>
        </Pressable>
      </View>
    </View>
  )
}

// Connected version that wires up adjust buttons via context
export function ConnectedStepTimer(props: Props) {
  const { adjustTimer, startTimer, pauseTimer, timers, hydrated, getRemainingSeconds, initializeTimer } = useTimers()
  const { colors } = useTheme()
  const id = `${props.recipeId}:${props.stepIndex}`
  const timer = timers.get(id)

  useEffect(() => {
    if (hydrated && !timers.get(id)) {
      initializeTimer(props.recipeId, props.stepIndex, props.stepLabel, props.recipeTitle, props.totalSeconds)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])

  const remaining = timer ? getRemainingSeconds(timer) : props.totalSeconds
  const isDone = timer?.isDone ?? false
  const isRunning = timer?.isRunning ?? false

  const statusLabel = isDone ? 'Done ✓' : isRunning ? 'Running' : timer ? 'Paused' : 'Ready'
  const timerColor = isDone ? colors.primary : isRunning ? colors.primaryDim : colors.onSurface
  const bgColor = isDone ? colors.primaryContainer : colors.surfaceContainer

  return (
    <View
      style={[styles.container, { backgroundColor: bgColor }]}
      testID={props.testID ?? `step-timer-${props.stepIndex}`}
    >
      <View>
        <Text style={[styles.statusLabel, { color: colors.onSurfaceVariant }]}>{statusLabel}</Text>
        <Text style={[styles.time, { color: timerColor }]} testID="timer-display">
          {formatTime(remaining)}
        </Text>
      </View>

      <View style={styles.controls}>
        <Pressable
          onPress={() => adjustTimer(id, -30)}
          style={styles.adjBtn}
          testID="timer-minus-30"
        >
          <Text style={[styles.adjLabel, { color: colors.onSurfaceVariant }]}>-30s</Text>
        </Pressable>

        <Pressable
          onPress={() => isRunning ? pauseTimer(id) : startTimer(props.recipeId, props.stepIndex, props.stepLabel, props.recipeTitle, props.totalSeconds)}
          style={[styles.playBtn, { backgroundColor: isRunning ? colors.primaryDim : colors.primary }]}
          testID={isRunning ? 'timer-pause' : 'timer-start'}
        >
          <MaterialIcon
            name={isRunning ? 'pause' : isDone ? 'replay' : 'play_arrow'}
            size={20}
            color={colors.onPrimary}
          />
        </Pressable>

        <Pressable
          onPress={() => adjustTimer(id, 30)}
          style={styles.adjBtn}
          testID="timer-plus-30"
        >
          <Text style={[styles.adjLabel, { color: colors.onSurfaceVariant }]}>+30s</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  statusLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  time: {
    fontSize: 24,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    minWidth: 64,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjBtn: {
    padding: 8,
  },
  adjLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
})
