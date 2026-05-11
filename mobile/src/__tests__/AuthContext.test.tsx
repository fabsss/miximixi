import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react-native'
import * as SecureStore from 'expo-secure-store'
import { AuthProvider, useAuth } from '../context/AuthContext'
import { TOKEN_KEY } from '@miximixi/shared/constants'

// Mock the shared api module
jest.mock('@miximixi/shared/api', () => ({
  configureApi: jest.fn(),
  getMe: jest.fn(),
  login: jest.fn(),
}))

const { getMe, login: apiLogin } = require('@miximixi/shared/api')

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
)

beforeEach(() => {
  jest.clearAllMocks()
  ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null)
})

describe('AuthContext — initial load', () => {
  test('starts with user=null and isLoading=true, then false when no token', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null)
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.user).toBeNull()
  })

  test('loads user from SecureStore when token present', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue('valid-token')
    const mockUser = { id: '1', email: 'a@b.com', display_name: 'Test', created_at: '2024-01-01' }
    ;(getMe as jest.Mock).mockResolvedValue(mockUser)
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.user).toEqual(mockUser)
  })

  test('clears token when getMe returns 401', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue('expired-token')
    ;(getMe as jest.Mock).mockRejectedValue(new Error('Session expired'))
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.user).toBeNull()
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(TOKEN_KEY)
  })
})

describe('AuthContext — login', () => {
  test('login stores token and sets user', async () => {
    const mockResp = {
      access_token: 'new-token',
      token_type: 'bearer',
      user: { id: '2', email: 'test@test.com', display_name: 'User' },
    }
    ;(apiLogin as jest.Mock).mockResolvedValue(mockResp)
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.login('test@test.com', 'password')
    })

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(TOKEN_KEY, 'new-token')
    expect(result.current.user?.email).toBe('test@test.com')
  })

  test('login propagates error on failed credentials', async () => {
    ;(apiLogin as jest.Mock).mockRejectedValue(new Error('Invalid credentials'))
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await expect(
      act(async () => { await result.current.login('bad@test.com', 'wrong') }),
    ).rejects.toThrow('Invalid credentials')
  })
})

describe('AuthContext — logout', () => {
  test('logout clears token and sets user to null', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue('some-token')
    const mockUser = { id: '1', email: 'a@b.com', display_name: 'Test', created_at: '2024-01-01' }
    ;(getMe as jest.Mock).mockResolvedValue(mockUser)

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.user).toBeTruthy())

    act(() => { result.current.logout() })

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(TOKEN_KEY)
    expect(result.current.user).toBeNull()
  })
})
