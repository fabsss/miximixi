/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  getMe,
  login as apiLogin,
  setStoredToken,
  clearStoredToken,
  getStoredToken,
  type CurrentUser,
} from '../lib/api'

interface AuthContextValue {
  user: CurrentUser | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = getStoredToken()
    if (!token) {
      setIsLoading(false) // eslint-disable-line react-hooks/set-state-in-effect
      return
    }
    getMe()
      .then(setUser)
      .catch(() => {
        clearStoredToken()
      })
      .finally(() => setIsLoading(false))
  }, [])

  async function login(email: string, password: string) {
    const { access_token, user: userData } = await apiLogin(email, password)
    setStoredToken(access_token)
    setUser(userData as CurrentUser)
  }

  function logout() {
    clearStoredToken()
    setUser(null)
  }

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
