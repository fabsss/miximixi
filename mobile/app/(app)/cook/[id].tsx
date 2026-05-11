import { useState, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
} from 'react-native'
import { useLocalSearchParams, router, Stack } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { activateKeepAwakeAsync, deactivateKeepAwakeAsync } from 'expo-keep-awake'
import { getRecipe, getStepImageUrl } from '@miximixi/shared/api'
import type { RecipeDetail } from '@miximixi/shared/types'
import { ConnectedStepTimer } from '../../../src/components/StepTimer'
import { TimerSheet } from '../../../src/components/TimerSheet'
import { MaterialIcon } from '../../../src/components/MaterialIcon'
import { useTheme } from '../../../src/context/ThemeContext'

export default function CookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { colors } = useTheme()
  const [currentStep, setCurrentStep] = useState(0)

  const { data: recipe, isLoading } = useQuery<RecipeDetail>({
    queryKey: ['recipe', id],
    queryFn: () => getRecipe(id!),
    enabled: !!id,
  })

  // Keep screen awake while cooking
  useEffect(() => {
    activateKeepAwakeAsync()
    return () => { deactivateKeepAwakeAsync() }
  }, [])

  if (isLoading || !recipe) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} testID="cook-loading" />
      </View>
    )
  }

  const steps = recipe.steps
  const step = steps[currentStep]
  const isFirst = currentStep === 0
  const isLast = currentStep === steps.length - 1

  return (
    <>
      <Stack.Screen
        options={{
          title: recipe.title,
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.onSurface,
          presentation: 'modal',
        }}
      />
      <StatusBar barStyle={colors === colors ? 'light-content' : 'dark-content'} />

      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {/* Step progress indicator */}
        <View style={[styles.progressBar, { backgroundColor: colors.surfaceContainer }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: colors.primary, width: `${((currentStep + 1) / steps.length) * 100}%` },
            ]}
          />
        </View>

        <ScrollView contentContainerStyle={styles.content} testID="cook-scroll">
          {/* Step number */}
          <Text style={[styles.stepCounter, { color: colors.onSurfaceVariant }]} testID="step-counter">
            Step {currentStep + 1} of {steps.length}
          </Text>

          {/* Step image */}
          {step?.step_image_filename && (
            <Image
              source={{ uri: getStepImageUrl(recipe.id, step.step_image_filename) }}
              style={styles.stepImage}
              resizeMode="cover"
              testID="step-image"
            />
          )}

          {/* Step text */}
          {step && (
            <Text style={[styles.stepText, { color: colors.onSurface }]} testID="step-text">
              {step.text}
            </Text>
          )}

          {/* Timer if step has time */}
          {step?.time_minutes != null && step.time_minutes > 0 && (
            <ConnectedStepTimer
              recipeId={recipe.id}
              stepIndex={currentStep}
              stepLabel={step.text.slice(0, 30)}
              recipeTitle={recipe.title}
              totalSeconds={step.time_minutes * 60}
              testID="cook-step-timer"
            />
          )}
        </ScrollView>

        {/* Navigation controls */}
        <View style={[styles.navBar, { backgroundColor: colors.surfaceLow, borderTopColor: colors.outlineVariant }]}>
          <Pressable
            onPress={() => setCurrentStep(s => Math.max(0, s - 1))}
            disabled={isFirst}
            style={[styles.navBtn, isFirst && styles.navBtnDisabled]}
            testID="prev-step-button"
            accessibilityLabel="Previous step"
          >
            <MaterialIcon name="chevron_left" size={28} color={isFirst ? colors.outlineVariant : colors.onSurface} />
            <Text style={{ color: isFirst ? colors.outlineVariant : colors.onSurface, fontSize: 13 }}>Prev</Text>
          </Pressable>

          <Pressable
            onPress={() => router.back()}
            style={[styles.exitBtn, { backgroundColor: colors.surfaceContainer }]}
            testID="exit-cook-button"
          >
            <Text style={{ color: colors.onSurfaceVariant, fontSize: 13, fontWeight: '600' }}>Exit</Text>
          </Pressable>

          {isLast ? (
            <Pressable
              onPress={() => router.back()}
              style={[styles.navBtn, { backgroundColor: colors.primaryContainer }]}
              testID="finish-button"
            >
              <MaterialIcon name="check_circle" size={28} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>Done!</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => setCurrentStep(s => Math.min(steps.length - 1, s + 1))}
              style={styles.navBtn}
              testID="next-step-button"
              accessibilityLabel="Next step"
            >
              <Text style={{ color: colors.onSurface, fontSize: 13 }}>Next</Text>
              <MaterialIcon name="chevron_right" size={28} color={colors.onSurface} />
            </Pressable>
          )}
        </View>

        <TimerSheet />
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  progressBar: { height: 4 },
  progressFill: { height: 4 },
  content: { padding: 20, gap: 16, paddingBottom: 100 },
  stepCounter: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  stepImage: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12 },
  stepText: { fontSize: 20, lineHeight: 30, fontWeight: '400' },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 12, borderRadius: 12 },
  navBtnDisabled: { opacity: 0.4 },
  exitBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
})
