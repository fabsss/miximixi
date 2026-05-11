import { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  TextInput,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import QRCode from 'react-native-qrcode-svg'
import {
  createTelegramLinkCode, getTelegramLinks, unlinkTelegramDevice,
  type TelegramLinkResponse, type TelegramLink,
} from '@miximixi/shared/api'
import { useAuth } from '../../src/context/AuthContext'
import { useTheme, type Theme } from '../../src/context/ThemeContext'
import { MaterialIcon } from '../../src/components/MaterialIcon'

export default function ProfileScreen() {
  const { user, logout } = useAuth()
  const { colors, theme, setTheme, effectiveTheme } = useTheme()
  const queryClient = useQueryClient()

  const [linkCode, setLinkCode] = useState<TelegramLinkResponse | null>(null)
  const [linkCountdown, setLinkCountdown] = useState(0)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { data: telegramLinks = [], isLoading: linksLoading } = useQuery({
    queryKey: ['telegramLinks'],
    queryFn: getTelegramLinks,
    staleTime: 60_000,
  })

  const createCodeMutation = useMutation({
    mutationFn: createTelegramLinkCode,
    onSuccess: code => {
      setLinkCode(code)
      setLinkCountdown(code.expires_in)
      // Start countdown
      if (countdownRef.current) clearInterval(countdownRef.current)
      countdownRef.current = setInterval(() => {
        setLinkCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownRef.current!)
            setLinkCode(null)
            return 0
          }
          return prev - 1
        })
      }, 1000)
      // Poll for new links while code is active
      const poll = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: ['telegramLinks'] })
      }, 5000)
      setTimeout(() => clearInterval(poll), code.expires_in * 1000)
    },
  })

  const unlinkMutation = useMutation({
    mutationFn: (telegramUserId: number) => unlinkTelegramDevice(telegramUserId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['telegramLinks'] }),
  })

  useEffect(() => {
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [])

  const handleUnlink = (link: TelegramLink) => {
    Alert.alert(
      'Unlink Device',
      `Unlink @${link.telegram_username ?? link.telegram_user_id}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unlink', style: 'destructive', onPress: () => unlinkMutation.mutate(link.telegram_user_id) },
      ],
    )
  }

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ])
  }

  const THEMES: { value: Theme; label: string; icon: string }[] = [
    { value: 'light', label: 'Light', icon: 'light_mode' },
    { value: 'dark', label: 'Dark', icon: 'dark_mode' },
    { value: 'system', label: 'System', icon: 'brightness_auto' },
  ]

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      testID="profile-scroll"
    >
      {/* User info */}
      <View style={[styles.card, { backgroundColor: colors.surfaceContainer }]}>
        <View style={[styles.avatar, { backgroundColor: colors.primaryContainer }]}>
          <Text style={[styles.avatarText, { color: colors.primary }]}>
            {user?.display_name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <Text style={[styles.displayName, { color: colors.onSurface }]} testID="display-name">
          {user?.display_name || 'No display name'}
        </Text>
        <Text style={[styles.email, { color: colors.onSurfaceVariant }]} testID="user-email">
          {user?.email}
        </Text>
        {user?.created_at && (
          <Text style={[styles.createdAt, { color: colors.onSurfaceVariant }]}>
            Member since {new Date(user.created_at).toLocaleDateString()}
          </Text>
        )}
      </View>

      {/* Theme picker */}
      <View style={[styles.card, { backgroundColor: colors.surfaceContainer }]}>
        <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Appearance</Text>
        <View style={styles.themeRow}>
          {THEMES.map(t => (
            <Pressable
              key={t.value}
              onPress={() => setTheme(t.value)}
              style={[
                styles.themeBtn,
                { backgroundColor: theme === t.value ? colors.primaryContainer : colors.surfaceHigh },
              ]}
              testID={`theme-${t.value}`}
            >
              <MaterialIcon
                name={t.icon}
                size={20}
                color={theme === t.value ? colors.primary : colors.onSurfaceVariant}
              />
              <Text style={{ color: theme === t.value ? colors.primary : colors.onSurfaceVariant, fontSize: 12, fontWeight: '600' }}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Telegram linking */}
      <View style={[styles.card, { backgroundColor: colors.surfaceContainer }]}>
        <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Telegram</Text>

        {/* Existing links */}
        {linksLoading ? (
          <ActivityIndicator color={colors.primary} testID="links-loading" />
        ) : telegramLinks.length > 0 ? (
          <View style={{ gap: 8 }}>
            {telegramLinks.map(link => (
              <View
                key={link.telegram_user_id}
                style={[styles.linkRow, { backgroundColor: colors.surfaceHigh }]}
                testID={`telegram-link-${link.telegram_user_id}`}
              >
                <MaterialIcon name="link" size={18} color={colors.secondary} />
                <Text style={[styles.linkText, { color: colors.onSurface }]}>
                  @{link.telegram_username ?? link.telegram_user_id}
                </Text>
                <Pressable
                  onPress={() => handleUnlink(link)}
                  testID={`unlink-${link.telegram_user_id}`}
                >
                  <MaterialIcon name="close" size={18} color={colors.onSurfaceVariant} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.noLinks, { color: colors.onSurfaceVariant }]}>
            No Telegram devices linked
          </Text>
        )}

        {/* Generate link code */}
        {linkCode ? (
          <View style={styles.qrContainer}>
            <Text style={[styles.qrHint, { color: colors.onSurfaceVariant }]}>
              Scan with Telegram (expires in {linkCountdown}s)
            </Text>
            <QRCode
              value={linkCode.deep_link}
              size={200}
              backgroundColor={colors.surfaceContainer}
              color={colors.onSurface}
              testID="telegram-qr-code"
            />
            <Text style={[styles.qrCode, { color: colors.onSurfaceVariant }]}>
              {linkCode.code}
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={() => createCodeMutation.mutate()}
            style={[styles.linkBtn, { backgroundColor: colors.secondary }]}
            testID="generate-link-button"
          >
            {createCodeMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialIcon name="qr_code" size={18} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700' }}>Link Telegram</Text>
              </>
            )}
          </Pressable>
        )}
      </View>

      {/* Sign out */}
      <Pressable
        onPress={handleLogout}
        style={[styles.logoutBtn, { backgroundColor: colors.surfaceContainer }]}
        testID="logout-button"
      >
        <MaterialIcon name="logout" size={18} color={colors.primary} />
        <Text style={[styles.logoutText, { color: colors.primary }]}>Sign Out</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  card: { borderRadius: 16, padding: 16, gap: 12 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  avatarText: { fontSize: 28, fontWeight: '700' },
  displayName: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  email: { fontSize: 14, textAlign: 'center' },
  createdAt: { fontSize: 12, textAlign: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  themeRow: { flexDirection: 'row', gap: 8 },
  themeBtn: { flex: 1, alignItems: 'center', gap: 6, padding: 12, borderRadius: 12 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10 },
  linkText: { flex: 1, fontSize: 14 },
  noLinks: { fontSize: 13 },
  qrContainer: { alignItems: 'center', gap: 12, paddingVertical: 8 },
  qrHint: { fontSize: 13 },
  qrCode: { fontSize: 16, fontWeight: '700', letterSpacing: 2 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: 14, justifyContent: 'center' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderRadius: 14, justifyContent: 'center' },
  logoutText: { fontSize: 15, fontWeight: '700' },
})
