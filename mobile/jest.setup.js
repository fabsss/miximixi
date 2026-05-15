// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}))

// Mock @react-native-async-storage/async-storage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)

// Mock expo-av
jest.mock('expo-av', () => ({
  Audio: {
    Sound: {
      createAsync: jest.fn().mockResolvedValue({
        sound: {
          replayAsync: jest.fn().mockResolvedValue(undefined),
          unloadAsync: jest.fn().mockResolvedValue(undefined),
        },
      }),
    },
    setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
  },
}))

// Mock expo-image-picker
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: 'Images' },
}))

// Mock expo-keep-awake
jest.mock('expo-keep-awake', () => ({
  useKeepAwake: jest.fn(),
  activateKeepAwakeAsync: jest.fn().mockResolvedValue(undefined),
}))

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: jest.fn().mockReturnValue({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: jest.fn().mockReturnValue({}),
  Link: ({ children }: { children: React.ReactNode }) => children,
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  },
}))

// Mock @gorhom/bottom-sheet
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, { testID: 'bottom-sheet' }, children),
    BottomSheetScrollView: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
  }
})

// Mock react-native-qrcode-svg
jest.mock('react-native-qrcode-svg', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: ({ testID }: { testID?: string }) =>
      React.createElement(View, { testID: testID ?? 'qr-code' }),
  }
})

// Mock react-native-safe-area-context so useSafeAreaInsets() works without native module
jest.mock('react-native-safe-area-context', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    SafeAreaProvider: ({ children }) => React.createElement(View, null, children),
    SafeAreaView: ({ children, style }) => React.createElement(View, { style }, children),
    useSafeAreaInsets: () => ({ top: 44, right: 0, bottom: 34, left: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
    initialWindowMetrics: { insets: { top: 44, left: 0, bottom: 34, right: 0 }, frame: { x: 0, y: 0, width: 390, height: 844 } },
  }
})

// Mock nativewind
jest.mock('nativewind', () => ({
  useColorScheme: jest.fn().mockReturnValue('light'),
}))

// Mock @expo/vector-icons to avoid expo-font → expo-asset native module chain
jest.mock('@expo/vector-icons', () => {
  const React = require('react')
  const { Text } = require('react-native')
  const Icon = ({ name, testID }) =>
    React.createElement(Text, { testID: testID ?? `icon-${name}` }, name)
  return {
    MaterialCommunityIcons: Icon,
    Ionicons: Icon,
    FontAwesome: Icon,
    FontAwesome5: Icon,
    AntDesign: Icon,
    Entypo: Icon,
    Feather: Icon,
    MaterialIcons: Icon,
  }
})
