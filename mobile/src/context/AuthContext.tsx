import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import * as SecureStore from 'expo-secure-store'
import { configureApi, getMe, login as apiLogin, type CurrentUser } from '@miximixi/shared/api'
import { TOKEN_KEY, DEFAULT_API_BASE_URL } from '@miximixi/shared/constants'
import { router } from 'expo-router'

interface AuthContextValue {
  user: CurrentUser | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Build the StorageAdapter backed by expo-secure-store
const storageAdapter = {
  getToken: () => SecureStore.getItemAsync(TOKEN_KEY),
  setToken: (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token),
  clearToken: () => SecureStore.deleteItemAsync(TOKEN_KEY),
  onUnauthenticated: () => router.replace('/login'),
}

// Configure the shared API client once at module load
configureApi(storageAdapter, DEFAULT_API_BASE_URL)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    SecureStore.getItemAsync(TOKEN_KEY).then(token => {
      if (!token) {
        setIsLoading(false)
        return
      }
      getMe()
        .then(setUser)
        .catch(() => SecureStore.deleteItemAsync(TOKEN_KEY))
        .finally(() => setIsLoading(false))
    })
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { access_token, user: userData } = await apiLogin(email, password)
    await SecureStore.setItemAsync(TOKEN_KEY, access_token)
    setUser(userData as CurrentUser)
  }, [])

  const logout = useCallback(() => {
    SecureStore.deleteItemAsync(TOKEN_KEY)
    setUser(null)
    router.replace('/login')
  }, [])

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
