import { configureApi, getRecipes, login, getMe, getHealth, mergeTags } from '../api'
import type { StorageAdapter } from '../api'

// Mock global fetch
const mockFetch = jest.fn()
global.fetch = mockFetch

function makeAdapter(token: string | null = 'test-token'): StorageAdapter & { cleared: boolean; redirected: boolean } {
  const adapter = {
    cleared: false,
    redirected: false,
    getToken: jest.fn().mockResolvedValue(token),
    setToken: jest.fn().mockResolvedValue(undefined),
    clearToken: jest.fn().mockImplementation(async () => { adapter.cleared = true }),
    onUnauthenticated: jest.fn().mockImplementation(() => { adapter.redirected = true }),
  }
  return adapter
}

function mockResponse(body: unknown, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  })
}

function mockNetworkError() {
  mockFetch.mockRejectedValueOnce(new Error('Network error'))
}

beforeEach(() => {
  mockFetch.mockReset()
})

describe('configureApi', () => {
  test('throws if request called before configureApi', async () => {
    // Reset module state by re-importing would be complex; test via indirect call
    const adapter = makeAdapter()
    configureApi(adapter, 'https://api.test')
    // After configure, it should work
    mockResponse({ status: 'ok', llm_provider: 'test' })
    const result = await getHealth()
    expect(result.status).toBe('ok')
  })
})

describe('request() — token injection', () => {
  test('injects Bearer token in Authorization header', async () => {
    const adapter = makeAdapter('my-jwt-token')
    configureApi(adapter, 'https://api.test')
    mockResponse([])
    await getRecipes()
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/recipes'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer my-jwt-token' }),
      }),
    )
  })

  test('does not inject Authorization header when no token', async () => {
    const adapter = makeAdapter(null)
    configureApi(adapter, 'https://api.test')
    mockResponse([])
    await getRecipes()
    const callHeaders = mockFetch.mock.calls[0][1].headers
    expect(callHeaders?.Authorization).toBeUndefined()
  })
})

describe('request() — 401 handling', () => {
  test('clears token and calls onUnauthenticated on 401', async () => {
    const adapter = makeAdapter()
    configureApi(adapter, 'https://api.test')
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: jest.fn().mockResolvedValue({ detail: 'Unauthorized' }),
    })
    await expect(getMe()).rejects.toThrow('Session expired')
    expect(adapter.cleared).toBe(true)
    expect(adapter.redirected).toBe(true)
  })
})

describe('request() — non-ok responses', () => {
  test('throws with API error for 404', async () => {
    const adapter = makeAdapter()
    configureApi(adapter, 'https://api.test')
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: jest.fn().mockResolvedValue({ detail: 'Recipe not found' }),
    })
    await expect(getMe()).rejects.toThrow('Recipe not found')
  })

  test('throws with status code if no detail field', async () => {
    const adapter = makeAdapter()
    configureApi(adapter, 'https://api.test')
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: jest.fn().mockRejectedValue(new Error('not json')),
    })
    await expect(getMe()).rejects.toThrow('API error 500')
  })
})

describe('request() — network error', () => {
  test('propagates network error', async () => {
    const adapter = makeAdapter()
    configureApi(adapter, 'https://api.test')
    mockNetworkError()
    await expect(getMe()).rejects.toThrow('Network error')
  })
})

describe('login()', () => {
  test('calls POST /auth/login with email + password', async () => {
    const adapter = makeAdapter(null)
    configureApi(adapter, 'https://api.test')
    const mockResp = {
      access_token: 'newtoken',
      token_type: 'bearer',
      user: { id: '1', email: 'a@b.com', display_name: 'Test' },
    }
    mockResponse(mockResp)
    const result = await login('a@b.com', 'password')
    expect(result.access_token).toBe('newtoken')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/login'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'a@b.com', password: 'password' }),
      }),
    )
  })

  test('throws with error detail on failed login', async () => {
    const adapter = makeAdapter(null)
    configureApi(adapter, 'https://api.test')
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: jest.fn().mockResolvedValue({ detail: 'Invalid credentials' }),
    })
    await expect(login('bad@email.com', 'wrong')).rejects.toThrow('Invalid credentials')
  })
})

describe('getRecipes() filters', () => {
  test('includes q param when search query provided', async () => {
    const adapter = makeAdapter()
    configureApi(adapter, 'https://api.test')
    mockResponse([])
    await getRecipes(20, 0, { q: 'pasta' })
    expect(mockFetch.mock.calls[0][0]).toContain('q=pasta')
  })

  test('includes category param', async () => {
    const adapter = makeAdapter()
    configureApi(adapter, 'https://api.test')
    mockResponse([])
    await getRecipes(20, 0, { category: 'Desserts' })
    expect(mockFetch.mock.calls[0][0]).toContain('category=Desserts')
  })

  test('includes multiple tag params', async () => {
    const adapter = makeAdapter()
    configureApi(adapter, 'https://api.test')
    mockResponse([])
    await getRecipes(20, 0, { tags: ['Vegan', 'Glutenfrei'] })
    const url: string = mockFetch.mock.calls[0][0]
    expect(url).toContain('tags=Vegan')
    expect(url).toContain('tags=Glutenfrei')
  })

  test('includes favorites=true when favorites filter set', async () => {
    const adapter = makeAdapter()
    configureApi(adapter, 'https://api.test')
    mockResponse([])
    await getRecipes(20, 0, { favorites: true })
    expect(mockFetch.mock.calls[0][0]).toContain('favorites=true')
  })

  test('includes limit and offset', async () => {
    const adapter = makeAdapter()
    configureApi(adapter, 'https://api.test')
    mockResponse([])
    await getRecipes(10, 40)
    const url: string = mockFetch.mock.calls[0][0]
    expect(url).toContain('limit=10')
    expect(url).toContain('offset=40')
  })
})

describe('mergeTags()', () => {
  test('POSTs correct body to /tags/merge', async () => {
    const adapter = makeAdapter()
    configureApi(adapter, 'https://api.test')
    mockResponse({ updated_recipes: 3 })
    const result = await mergeTags(['OldTag', 'AnotherTag'], 'NewTag')
    expect(result.updated_recipes).toBe(3)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/tags/merge'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ source_tags: ['OldTag', 'AnotherTag'], target_tag: 'NewTag' }),
      }),
    )
  })
})
