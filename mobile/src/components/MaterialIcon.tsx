import { Text } from 'react-native'
// Import glyph map directly — Metro bundles JSON as a module.
// This bypasses @expo/vector-icons' async font-loading state machine entirely.
// The font 'MaterialCommunityIcons' is loaded synchronously via useFonts() in _layout.tsx.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const glyphMap: Record<string, number> = require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json')

// Map web Material Symbols names → MaterialCommunityIcons names
const ICON_MAP: Record<string, string> = {
  search:              'magnify',
  sell:                'tag-outline',
  timer:               'timer-outline',
  menu:                'menu',
  arrow_back:          'arrow-left',
  translate:           'translate',
  edit:                'pencil-outline',
  delete:              'trash-can-outline',
  close:               'close',
  add:                 'plus',
  remove:              'minus',
  check_circle:        'check-circle-outline',
  restaurant:          'silverware-fork-knife',
  brightness_auto:     'brightness-auto',
  dark_mode:           'weather-night',
  light_mode:          'weather-sunny',
  people:              'account-group-outline',
  schedule:            'clock-outline',
  link:                'link-variant',
  lightbulb:           'lightbulb-outline',
  upload:              'upload-outline',
  favorite:            'heart',
  favorite_border:     'heart-outline',
  star:                'star',
  star_border:         'star-outline',
  thumb_down:          'thumb-down-outline',
  thumb_up:            'thumb-up-outline',
  share:               'share-variant-outline',
  qr_code:             'qrcode',
  more_vert:           'dots-vertical',
  image:               'image-outline',
  info:                'information-outline',
  warning:             'alert-outline',
  refresh:             'refresh',
  logout:              'logout',
  person:              'account-outline',
  notifications:       'bell-outline',
  check:               'check',
  chevron_right:       'chevron-right',
  chevron_left:        'chevron-left',
  expand_more:         'chevron-down',
  expand_less:         'chevron-up',
  play_arrow:          'play',
  pause:               'pause',
  replay:              'replay',
  stop:                'stop',
  skip_next:           'skip-next',
  skip_previous:       'skip-previous',
  zoom_in:             'magnify-plus-outline',
  // Category icons (passed through directly)
  'bowl-mix-outline':  'bowl-mix-outline',
  food:                'food',
  'ice-cream':         'ice-cream',
  coffee:              'coffee-outline',
  'cookie-outline':    'cookie-outline',
  'cup-water':         'cup-water',
  'silverware-fork-knife': 'silverware-fork-knife',
}

interface Props {
  name: string
  size?: number
  color?: string
  testID?: string
}

export function MaterialIcon({ name, size = 24, color = '#000', testID }: Props) {
  const mcName = ICON_MAP[name] ?? 'help-circle-outline'
  const codePoint = glyphMap[mcName] ?? glyphMap['help-circle-outline']
  const glyph = String.fromCodePoint(codePoint)
  return (
    <Text
      style={{ fontFamily: 'MaterialCommunityIcons', fontSize: size, color, lineHeight: size * 1.2 }}
      allowFontScaling={false}
      testID={testID ?? `icon-${name}`}
    >
      {glyph}
    </Text>
  )
}
