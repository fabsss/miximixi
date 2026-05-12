import { Tabs, router } from 'expo-router'
import { useCallback, useEffect } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { useAuth } from '../../src/context/AuthContext'
import { useTheme, type Theme } from '../../src/context/ThemeContext'
import { MaterialIcon } from '../../src/components/MaterialIcon'
import { TimerSheet } from '../../src/components/TimerSheet'

const THEME_CYCLE: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' }
const THEME_ICON: Record<Theme, string> = { light: 'light_mode', dark: 'dark_mode', system: 'brightness_auto' }

function ProtectedLayout() {
  const { user, isLoading } = useAuth()
  const { colors, theme, setTheme } = useTheme()

  const cycleTheme = useCallback(() => setTheme(THEME_CYCLE[theme]), [theme, setTheme])

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login')
    }
  }, [user, isLoading])

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (!user) return null

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          tabBarStyle: { backgroundColor: colors.surfaceLow, borderTopColor: colors.outlineVariant },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.onSurfaceVariant,
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.onSurface,
          headerTitleStyle: { fontFamily: 'NotoSerif_700Bold', fontSize: 18 },
          headerRight: () => (
            <Pressable onPress={cycleTheme} style={{ marginRight: 16 }} accessibilityLabel={`Switch theme (current: ${theme})`}>
              <MaterialIcon name={THEME_ICON[theme]} size={22} color={colors.onSurface} />
            </Pressable>
          ),
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Recipes',
            tabBarLabel: 'Feed',
            tabBarIcon: ({ color, size }) => (
              <MaterialIcon name="restaurant" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="tags"
          options={{
            title: 'Tags',
            tabBarIcon: ({ color, size }) => (
              <MaterialIcon name="sell" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size }) => (
              <MaterialIcon name="person" size={size} color={color} />
            ),
          }}
        />
        {/* Hidden from tab bar */}
        <Tabs.Screen name="recipe/[id]" options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="cook/[id]" options={{ href: null, headerShown: false }} />
      </Tabs>
      <TimerSheet />
    </View>
  )
}

export default ProtectedLayout
