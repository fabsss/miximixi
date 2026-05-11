import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import LoginScreen from '../login'
import { ThemeProvider } from '../../src/context/ThemeContext'
import AsyncStorage from '@react-native-async-storage/async-storage'

const mockLogin = jest.fn()
const mockUser = null
const mockAuthLoading = false

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    user: mockUser,
    isLoading: mockAuthLoading,
  }),
}))

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider>{children}</ThemeProvider>
)

beforeEach(() => {
  jest.clearAllMocks()
  ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(null)
  mockLogin.mockReset()
})

describe('LoginScreen', () => {
  test('renders email and password inputs', () => {
    const { getByTestId } = render(<LoginScreen />, { wrapper })
    expect(getByTestId('email-input')).toBeTruthy()
    expect(getByTestId('password-input')).toBeTruthy()
  })

  test('renders login button', () => {
    const { getByTestId } = render(<LoginScreen />, { wrapper })
    expect(getByTestId('login-button')).toBeTruthy()
  })

  test('calls login() with email and password on submit', async () => {
    mockLogin.mockResolvedValue(undefined)
    const { getByTestId } = render(<LoginScreen />, { wrapper })

    fireEvent.changeText(getByTestId('email-input'), 'test@example.com')
    fireEvent.changeText(getByTestId('password-input'), 'mypassword')
    fireEvent.press(getByTestId('login-button'))

    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'mypassword'))
  })

  test('shows error when login fails', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid credentials'))
    const { getByTestId, getByText } = render(<LoginScreen />, { wrapper })

    fireEvent.changeText(getByTestId('email-input'), 'bad@example.com')
    fireEvent.changeText(getByTestId('password-input'), 'wrongpass')
    await act(async () => { fireEvent.press(getByTestId('login-button')) })

    await waitFor(() => expect(getByText('Invalid credentials')).toBeTruthy())
  })

  test('shows error when fields are empty', async () => {
    const { getByTestId, getByText } = render(<LoginScreen />, { wrapper })
    await act(async () => { fireEvent.press(getByTestId('login-button')) })
    await waitFor(() => expect(getByText('Please enter email and password')).toBeTruthy())
  })

  test('remember-me toggle is present', () => {
    const { getByTestId } = render(<LoginScreen />, { wrapper })
    expect(getByTestId('remember-me-toggle')).toBeTruthy()
  })

  test('saves email to AsyncStorage when remember-me checked', async () => {
    mockLogin.mockResolvedValue(undefined)
    const { getByTestId } = render(<LoginScreen />, { wrapper })

    fireEvent.changeText(getByTestId('email-input'), 'saved@example.com')
    fireEvent.changeText(getByTestId('password-input'), 'password123')
    fireEvent.press(getByTestId('remember-me-toggle')) // enable remember me
    await act(async () => { fireEvent.press(getByTestId('login-button')) })

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'mx_remember_email',
        'saved@example.com',
      )
    )
  })

  test('loads remembered email from AsyncStorage', async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue('remembered@example.com')
    const { getByTestId } = render(<LoginScreen />, { wrapper })
    await waitFor(() =>
      expect(getByTestId('email-input').props.value).toBe('remembered@example.com')
    )
  })
})
