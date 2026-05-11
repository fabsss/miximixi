import { useState } from 'react'
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getTagsWithCounts, mergeTags } from '@miximixi/shared/api'
import type { TagWithCount } from '@miximixi/shared/api'
import { MaterialIcon } from '../../src/components/MaterialIcon'
import { useTheme } from '../../src/context/ThemeContext'

export default function TagsScreen() {
  const { colors } = useTheme()
  const queryClient = useQueryClient()
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [mergeTarget, setMergeTarget] = useState('')
  const [showMergeInput, setShowMergeInput] = useState(false)

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ['tagsWithCounts'],
    queryFn: getTagsWithCounts,
    staleTime: 30_000,
  })

  const mergeMutation = useMutation({
    mutationFn: () => mergeTags(selectedTags, mergeTarget),
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: ['tagsWithCounts'] })
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
      Alert.alert('Tags merged', `Updated ${result.updated_recipes} recipes`)
      setSelectedTags([])
      setMergeTarget('')
      setShowMergeInput(false)
    },
    onError: (e: Error) => Alert.alert('Merge failed', e.message),
  })

  const handleToggle = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag],
    )
  }

  const handleMergePress = () => {
    if (selectedTags.length < 1) {
      Alert.alert('Select tags', 'Select at least one tag to merge.')
      return
    }
    setShowMergeInput(true)
  }

  const handleMergeConfirm = () => {
    if (!mergeTarget.trim()) {
      Alert.alert('Enter target', 'Enter the target tag name.')
      return
    }
    Alert.alert(
      'Merge Tags',
      `Merge "${selectedTags.join(', ')}" → "${mergeTarget}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Merge', onPress: () => mergeMutation.mutate() },
      ],
    )
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Merge panel */}
      {selectedTags.length > 0 && (
        <View style={[styles.mergePanel, { backgroundColor: colors.surfaceContainer }]}>
          <Text style={[styles.mergePanelTitle, { color: colors.onSurface }]}>
            {selectedTags.length} tag{selectedTags.length > 1 ? 's' : ''} selected
          </Text>
          {showMergeInput ? (
            <View style={styles.mergeInputRow}>
              <TextInput
                style={[styles.mergeInput, { backgroundColor: colors.surfaceHigh, color: colors.onSurface, borderColor: colors.outlineVariant }]}
                value={mergeTarget}
                onChangeText={setMergeTarget}
                placeholder="Target tag name"
                placeholderTextColor={colors.onSurfaceVariant}
                testID="merge-target-input"
                autoFocus
              />
              <Pressable
                onPress={handleMergeConfirm}
                style={[styles.mergeBtn, { backgroundColor: colors.primary }]}
                testID="merge-confirm-button"
              >
                {mergeMutation.isPending ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>Merge</Text>
                )}
              </Pressable>
              <Pressable onPress={() => setShowMergeInput(false)} testID="cancel-merge-input">
                <MaterialIcon name="close" size={20} color={colors.onSurfaceVariant} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.mergeBtnRow}>
              <Pressable
                onPress={handleMergePress}
                style={[styles.mergeBtn, { backgroundColor: colors.primary }]}
                testID="merge-button"
              >
                <MaterialIcon name="merge" size={18} color={colors.onPrimary} />
                <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>Merge…</Text>
              </Pressable>
              <Pressable
                onPress={() => setSelectedTags([])}
                style={[styles.mergeBtn, { backgroundColor: colors.surfaceVariant }]}
                testID="deselect-all-button"
              >
                <Text style={{ color: colors.onSurface }}>Deselect</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {isLoading ? (
        <ActivityIndicator style={{ margin: 32 }} color={colors.primary} testID="tags-loading" />
      ) : (
        <FlatList
          data={tags}
          keyExtractor={t => t.tag}
          contentContainerStyle={{ paddingBottom: 80 }}
          renderItem={({ item }: { item: TagWithCount }) => {
            const isSelected = selectedTags.includes(item.tag)
            return (
              <Pressable
                onPress={() => handleToggle(item.tag)}
                style={[
                  styles.tagRow,
                  {
                    backgroundColor: isSelected ? colors.primaryContainer : colors.surface,
                    borderBottomColor: colors.outlineVariant,
                  },
                ]}
                testID={`tag-row-${item.tag}`}
              >
                <View style={[styles.selectIndicator, {
                  borderColor: isSelected ? colors.primary : colors.outlineVariant,
                  backgroundColor: isSelected ? colors.primary : 'transparent',
                }]}>
                  {isSelected && (
                    <MaterialIcon name="check" size={12} color={colors.onPrimary} />
                  )}
                </View>
                <Text style={[styles.tagName, { color: isSelected ? colors.primary : colors.onSurface }]}>
                  {item.tag}
                </Text>
                <View style={[styles.countBadge, { backgroundColor: colors.surfaceContainer }]}>
                  <Text style={[styles.countText, { color: colors.onSurfaceVariant }]}>{item.count}</Text>
                </View>
              </Pressable>
            )
          }}
          testID="tags-list"
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  mergePanel: { padding: 16, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  mergePanelTitle: { fontSize: 14, fontWeight: '600' },
  mergeInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  mergeInput: { flex: 1, height: 40, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, fontSize: 14 },
  mergeBtnRow: { flexDirection: 'row', gap: 8 },
  mergeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  tagRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  selectIndicator: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tagName: { flex: 1, fontSize: 15 },
  countBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  countText: { fontSize: 12, fontWeight: '600' },
})
