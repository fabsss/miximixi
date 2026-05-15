import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react-native'
import * as SecureStore from 'expo-secure-store'
import { AuthProvider, useAuth } from '../../context/AuthContext'
import { TOKEN_KEY } from '@miximixi/shared/constants'

jest.mock('@miximixi/shared/api', () => ({
  configureApi: jest.fn(),
  getMe: jest.fn(),
  login: jest.fn(),
}))

const { getMe, login: apiLogin } = require('@miximixi/shared/api')
const mockRouterReplace = jest.fn()

jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockRouterReplace(...args) },
  useRouter: () => ({ replace: mockRouterReplace }),
}))

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
)

describe('Auth flow — integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null)
  })

  test('full login flow: no token → login → user set', async () => {
    const user = { id: '1', email: 'a@b.com', display_name: 'A', created_at: '2024-01-01' }
    ;(apiLogin as jest.Mock).mockResolvedValue({ access_token: 'tok', token_type: 'bearer', user })

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.user).toBeNull()

    await act(async () => { await result.current.login('a@b.com', 'pw') })

    expect(result.current.user?.email).toBe('a@b.com')
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(TOKEN_KEY, 'tok')
  })

  test('full logout flow: user set → logout → null and redirected', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue('some-token')
    const user = { id: '1', email: 'a@b.com', display_name: 'A', created_at: '2024-01-01' }
    ;(getMe as jest.Mock).mockResolvedValue(user)

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.user).toBeTruthy())

    act(() => { result.current.logout() })

    expect(result.current.user).toBeNull()
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(TOKEN_KEY)
    expect(mockRouterReplace).toHaveBeenCalledWith('/login')
  })

  test('401 from API triggers token clear and redirect', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue('expired-token')
    ;(getMe as jest.Mock).mockRejectedValue(new Error('Session expired'))

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.user).toBeNull()
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(TOKEN_KEY)
  })
})
