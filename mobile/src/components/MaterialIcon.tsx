import { MaterialCommunityIcons } from '@expo/vector-icons'
import type { ComponentProps } from 'react'

// Map web Material Symbols names to MaterialCommunityIcons equivalents
const ICON_MAP: Record<string, ComponentProps<typeof MaterialCommunityIcons>['name']> = {
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
  // Category icons
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
  const mapped = ICON_MAP[name] ?? ('help-circle-outline' as ComponentProps<typeof MaterialCommunityIcons>['name'])
  return (
    <MaterialCommunityIcons
      name={mapped}
      size={size}
      color={color}
      testID={testID ?? `icon-${name}`}
    />
  )
}
