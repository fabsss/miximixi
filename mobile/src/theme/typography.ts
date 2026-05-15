import { StyleSheet } from 'react-native'

export const FontFamily = {
  headline:      'NotoSerif_400Regular',
  headlineBold:  'NotoSerif_700Bold',
  body:          'PlusJakartaSans_400Regular',
  bodySemibold:  'PlusJakartaSans_600SemiBold',
  bodyBold:      'PlusJakartaSans_700Bold',
  label:         'PlusJakartaSans_500Medium',
}

export const Typography = StyleSheet.create({
  h1: {
    fontFamily: FontFamily.headlineBold,
    fontSize: 32,
    letterSpacing: -0.64,
    lineHeight: 40,
  },
  h2: {
    fontFamily: FontFamily.headlineBold,
    fontSize: 24,
    letterSpacing: -0.48,
    lineHeight: 32,
  },
  h3: {
    fontFamily: FontFamily.headline,
    fontSize: 20,
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  h4: {
    fontFamily: FontFamily.headline,
    fontSize: 16,
    letterSpacing: -0.32,
    lineHeight: 24,
  },
  body: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22,
  },
  bodySm: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 20,
  },
  bodyXs: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
  },
  label: {
    fontFamily: FontFamily.label,
    fontSize: 13,
    letterSpacing: 0.1,
  },
  labelSm: {
    fontFamily: FontFamily.label,
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
})
