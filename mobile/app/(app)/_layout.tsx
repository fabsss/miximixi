import { Tabs, router } from 'expo-router'
import { useEffect } from 'react'
import { useAuth } from '../../src/context/AuthContext'
import { useTheme } from '../../src/context/ThemeContext'
import { MaterialIcon } from '../../src/components/MaterialIcon'
import { TimerSheet } from '../../src/components/TimerSheet'
import { View } from 'react-native'

function ProtectedLayout() {
  const { user, isLoading } = useAuth()
  const { colors } = useTheme()

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login')
    }
  }, [user, isLoading])

  if (isLoading || !user) return null

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
