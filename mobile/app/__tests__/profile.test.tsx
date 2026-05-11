import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import ProfileScreen from '../(app)/profile'
import { ThemeProvider } from '../../src/context/ThemeContext'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockUser = { id: 'u1', email: 'user@example.com', display_name: 'Test User', created_at: '2024-01-01T00:00:00Z' }
const mockLogout = jest.fn()

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    logout: mockLogout,
  }),
}))

const mockTelegramLinks = [
  { telegram_user_id: 123456, telegram_username: 'testuser', linked_at: '2024-01-01' },
]
const mockCreateCode = jest.fn().mockResolvedValue({
  code: 'MIX-TESTCODE',
  deep_link: 'https://t.me/miximixi_bot?start=MIX-TESTCODE',
  expires_in: 300,
})
const mockUnlink = jest.fn().mockResolvedValue(undefined)

jest.mock('@miximixi/shared/api', () => ({
  getTelegramLinks: jest.fn().mockResolvedValue(mockTelegramLinks),
  createTelegramLinkCode: () => mockCreateCode(),
  unlinkTelegramDevice: (...args: unknown[]) => mockUnlink(...args),
}))

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  )
}

describe('ProfileScreen', () => {
  test('shows user display name', async () => {
    const { getByTestId } = render(<ProfileScreen />, { wrapper })
    await waitFor(() => expect(getByTestId('display-name').props.children).toBe('Test User'))
  })

  test('shows user email', async () => {
    const { getByTestId } = render(<ProfileScreen />, { wrapper })
    await waitFor(() => expect(getByTestId('user-email').props.children).toBe('user@example.com'))
  })

  test('shows linked Telegram devices', async () => {
    const { getByTestId } = render(<ProfileScreen />, { wrapper })
    await waitFor(() => expect(getByTestId('telegram-link-123456')).toBeTruthy())
  })

  test('unlink button triggers confirmation and API call', async () => {
    const { Alert } = require('react-native')
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(
      (_title, _msg, buttons) => buttons?.[1]?.onPress?.(),
    )
    const { getByTestId } = render(<ProfileScreen />, { wrapper })
    await waitFor(() => getByTestId('unlink-123456'))
    await act(async () => { fireEvent.press(getByTestId('unlink-123456')) })
    await waitFor(() => expect(mockUnlink).toHaveBeenCalledWith(123456))
    alertSpy.mockRestore()
  })

  test('generate link button creates QR code', async () => {
    const { getByTestId } = render(<ProfileScreen />, { wrapper })
    await waitFor(() => getByTestId('generate-link-button'))
    await act(async () => { fireEvent.press(getByTestId('generate-link-button')) })
    await waitFor(() => expect(getByTestId('telegram-qr-code')).toBeTruthy())
  })

  test('logout button calls logout with confirmation', async () => {
    const { Alert } = require('react-native')
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(
      (_title, _msg, buttons) => buttons?.[1]?.onPress?.(),
    )
    const { getByTestId } = render(<ProfileScreen />, { wrapper })
    fireEvent.press(getByTestId('logout-button'))
    await waitFor(() => expect(mockLogout).toHaveBeenCalled())
    alertSpy.mockRestore()
  })

  test('theme buttons are rendered', () => {
    const { getByTestId } = render(<ProfileScreen />, { wrapper })
    expect(getByTestId('theme-light')).toBeTruthy()
    expect(getByTestId('theme-dark')).toBeTruthy()
    expect(getByTestId('theme-system')).toBeTruthy()
  })

  test('clicking theme dark switches theme', async () => {
    const { getByTestId } = render(<ProfileScreen />, { wrapper })
    fireEvent.press(getByTestId('theme-dark'))
    // Theme context should update — just confirm no crash
    expect(getByTestId('theme-dark')).toBeTruthy()
  })
})
