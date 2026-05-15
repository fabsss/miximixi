import * as ImagePicker from 'expo-image-picker'
import { configureApi, uploadRecipeImage, uploadStepImage } from '@miximixi/shared/api'
import type { StorageAdapter } from '@miximixi/shared/api'

const mockFetch = jest.fn()
global.fetch = mockFetch

const adapter: StorageAdapter = {
  getToken: jest.fn().mockResolvedValue('test-token'),
  setToken: jest.fn(),
  clearToken: jest.fn(),
  onUnauthenticated: jest.fn(),
}

beforeEach(() => {
  jest.clearAllMocks()
  configureApi(adapter, 'https://api.test')
  mockFetch.mockResolvedValue({ ok: true, status: 200, json: jest.fn() })
})

describe('Image upload integration', () => {
  test('expo-image-picker asset maps to correct FormData shape', async () => {
    const mockAsset = {
      uri: 'file:///tmp/photo.jpg',
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
    }

    ;(ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [mockAsset],
    })

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    })

    expect(result.canceled).toBe(false)
    if (!result.canceled) {
      const asset = result.assets[0]
      // Simulate how the screen passes asset to upload
      const fileInput = { uri: asset.uri, name: asset.fileName ?? 'image.jpg', type: asset.mimeType ?? 'image/jpeg' }

      await uploadRecipeImage('recipe-1', fileInput as unknown as File)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/recipes/recipe-1/image'),
        expect.objectContaining({ method: 'POST' }),
      )
    }
  })

  test('uploadRecipeImage sends multipart/form-data request', async () => {
    const fileInput = { uri: 'file:///tmp/photo.jpg', name: 'photo.jpg', type: 'image/jpeg' }
    await uploadRecipeImage('r1', fileInput as unknown as File)

    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toContain('/recipes/r1/image')
    expect(options.method).toBe('POST')
    // Body should be FormData (not JSON)
    expect(options.body).toBeInstanceOf(FormData)
  })

  test('uploadStepImage sends to correct endpoint', async () => {
    const fileInput = { uri: 'file:///tmp/step.jpg', name: 'step.jpg', type: 'image/jpeg' }
    await uploadStepImage('r1', 's1', fileInput as unknown as File)

    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('/recipes/r1/steps/s1/image')
  })

  test('upload includes Authorization header', async () => {
    const fileInput = { uri: 'file:///tmp/photo.jpg', name: 'photo.jpg', type: 'image/jpeg' }
    await uploadRecipeImage('r1', fileInput as unknown as File)

    const [, options] = mockFetch.mock.calls[0]
    expect(options.headers?.Authorization).toBe('Bearer test-token')
  })

  test('upload throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 413 })
    const fileInput = { uri: 'file:///tmp/photo.jpg', name: 'photo.jpg', type: 'image/jpeg' }
    await expect(uploadRecipeImage('r1', fileInput as unknown as File)).rejects.toThrow('Image upload failed: 413')
  })
})
