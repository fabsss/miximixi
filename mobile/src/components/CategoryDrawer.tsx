import { useEffect, useRef } from 'react'
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { getCategoryIcon, getCategoryLabel } from '@miximixi/shared/categoryUtils'
import { useTheme } from '../context/ThemeContext'
import { getCatColors } from '../theme/colors'
import { MaterialIcon } from './MaterialIcon'

const DRAWER_WIDTH = 300

interface Props {
  isOpen: boolean
  onClose: () => void
  categories: string[]
  counts: Record<string, number>
  selectedCategory: string | null
  onSelectCategory: (cat: string | null) => void
}

export function CategoryDrawer({
  isOpen, onClose, categories, counts, selectedCategory, onSelectCategory,
}: Props) {
  const { colors, effectiveTheme } = useTheme()
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current
  const backdropAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, friction: 8, tension: 60 }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: -DRAWER_WIDTH, duration: 200, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start()
    }
  }, [isOpen, slideAnim, backdropAnim])

  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        {/* Backdrop */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropAnim }]}>
          <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
        </Animated.View>

        {/* Drawer panel */}
        <Animated.View
          style={[
            styles.drawer,
            { backgroundColor: colors.surface, transform: [{ translateX: slideAnim }] },
          ]}
        >
          {/* Header */}
          <View style={[styles.drawerHeader, { borderBottomColor: colors.outlineVariant }]}>
            <Text style={[styles.drawerTitle, { color: colors.primary }]}>Miximixi</Text>
            <Pressable onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close menu">
              <MaterialIcon name="close" size={22} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.drawerContent} showsVerticalScrollIndicator={false}>
            <Text style={[styles.sectionLabel, { color: colors.onSurfaceVariant }]}>Categories</Text>

            {/* All */}
            <Pressable
              onPress={() => { onSelectCategory(null); onClose() }}
              style={[
                styles.catRow,
                { backgroundColor: !selectedCategory ? colors.primaryContainer : 'transparent' },
              ]}
              testID="category-item-all"
            >
              <View style={[styles.catIconWrap, { backgroundColor: !selectedCategory ? colors.primary : colors.surfaceVariant }]}>
                <MaterialIcon name="restaurant" size={18} color={!selectedCategory ? colors.onPrimary : colors.onSurfaceVariant} />
              </View>
              <Text style={[styles.catLabel, { color: !selectedCategory ? colors.primaryDim : colors.onSurface, fontWeight: !selectedCategory ? '700' : '500' }]}>
                All Recipes
              </Text>
              {totalCount > 0 && (
                <Text style={[styles.catCount, { color: !selectedCategory ? colors.primaryDim : colors.onSurfaceVariant }]}>
                  {totalCount}
                </Text>
              )}
            </Pressable>

            {/* Each category */}
            {categories.map(cat => {
              const isActive = selectedCategory === cat
              const catColors = getCatColors(cat, colors)
              const icon = getCategoryIcon(cat)
              const label = getCategoryLabel(cat)
              const count = counts[cat] ?? 0
              return (
                <Pressable
                  key={cat}
                  onPress={() => { onSelectCategory(cat); onClose() }}
                  style={[
                    styles.catRow,
                    isActive && { backgroundColor: `${catColors.bg}cc` },
                  ]}
                  testID={`category-item-${cat.toLowerCase()}`}
                >
                  <View style={[styles.catIconWrap, { backgroundColor: catColors.bg }]}>
                    <MaterialIcon name={icon} size={18} color={catColors.text} />
                  </View>
                  <Text style={[styles.catLabel, { color: isActive ? catColors.text : colors.onSurface, fontWeight: isActive ? '700' : '500' }]}>
                    {label}
                  </Text>
                  {count > 0 && (
                    <Text style={[styles.catCount, { color: isActive ? catColors.text : colors.onSurfaceVariant }]}>
                      {count}
                    </Text>
                  )}
                </Pressable>
              )
            })}

          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  drawer: {
    width: DRAWER_WIDTH,
    height: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 16,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  drawerTitle: {
    fontSize: 26,
    fontWeight: '700',
    fontFamily: 'NotoSerif_700Bold',
  },
  closeBtn: {
    padding: 4,
  },
  drawerContent: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 2,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: 8,
    paddingBottom: 8,
    paddingTop: 4,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  catIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catLabel: {
    flex: 1,
    fontSize: 15,
  },
  catCount: {
    fontSize: 13,
    fontWeight: '600',
  },

})
