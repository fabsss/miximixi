import { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuth } from '../src/context/AuthContext'
import { useTheme } from '../src/context/ThemeContext'

const REMEMBER_KEY = 'mx_remember_email'

export default function LoginScreen() {
  const { colors } = useTheme()
  const { login, user, isLoading: authLoading } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load remembered email
  useEffect(() => {
    AsyncStorage.getItem(REMEMBER_KEY).then(saved => {
      if (saved) { setEmail(saved); setRememberMe(true) }
    })
  }, [])

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) router.replace('/(app)')
  }, [user, authLoading])

  const handleLogin = async () => {
    if (!email || !password) { setError('Please enter email and password'); return }
    setLoading(true)
    setError(null)
    try {
      await login(email, password)
      if (rememberMe) {
        await AsyncStorage.setItem(REMEMBER_KEY, email)
      } else {
        await AsyncStorage.removeItem(REMEMBER_KEY)
      }
      router.replace('/(app)')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={[styles.appName, { color: colors.primary }]}>Miximixi</Text>
          <Text style={[styles.subtitle, { color: colors.onSurfaceVariant }]}>
            Your recipe collection
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surfaceContainer }]}>
          {error && (
            <View style={[styles.errorBox, { backgroundColor: colors.primaryContainer }]}>
              <Text style={[styles.errorText, { color: colors.primary }]} testID="login-error">
                {error}
              </Text>
            </View>
          )}

          <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>Email</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surfaceHigh, color: colors.onSurface, borderColor: colors.outlineVariant }]}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="you@example.com"
            placeholderTextColor={colors.onSurfaceVariant}
            testID="email-input"
            returnKeyType="next"
          />

          <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>Password</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surfaceHigh, color: colors.onSurface, borderColor: colors.outlineVariant }]}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={colors.onSurfaceVariant}
            testID="password-input"
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          <Pressable
            onPress={() => setRememberMe(r => !r)}
            style={styles.checkRow}
            testID="remember-me-toggle"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: rememberMe }}
          >
            <View style={[
              styles.checkbox,
              { borderColor: colors.outlineVariant },
              rememberMe && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}>
              {rememberMe && <Text style={{ color: colors.onPrimary, fontSize: 12 }}>✓</Text>}
            </View>
            <Text style={[styles.checkLabel, { color: colors.onSurfaceVariant }]}>Remember me</Text>
          </Pressable>

          <Pressable
            onPress={handleLogin}
            style={[styles.loginBtn, { backgroundColor: colors.primary }, (loading) && styles.btnDisabled]}
            disabled={loading}
            testID="login-button"
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={[styles.loginBtnText, { color: colors.onPrimary }]}>Sign In</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  appName: {
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    marginTop: 4,
  },
  card: {
    borderRadius: 20,
    padding: 24,
    gap: 8,
  },
  errorBox: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    fontWeight: '500',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkLabel: {
    fontSize: 14,
  },
  loginBtn: {
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  btnDisabled: { opacity: 0.6 },
  loginBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
})
