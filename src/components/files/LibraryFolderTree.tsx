import { useNativeLocale, useTranslation } from '@/i18n';
import React, { useEffect, useState } from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';

import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import { isRecord, pickArray, pickNumber, pickString, type ApiRecord } from '@/utils/data';

export function LibraryFolderTree({ tree, sort, ascending, collapsed, wrap, onChoose, nested = false }: {
  tree: ApiRecord[]; sort: 'name' | 'activity'; ascending: boolean;
  collapsed: boolean; wrap: boolean; onChoose: (id: number | null) => void; nested?: boolean;
}) {
  useNativeLocale();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState<number[]>([]);
  const nodeIds = tree.map(node => pickNumber(node, ['id'])).join(',');
  useEffect(() => { setExpanded(collapsed || !nodeIds ? [] : nodeIds.split(',').map(Number)); }, [collapsed, nodeIds]);
  const ordered = [...tree].sort((a, b) => {
    const result = sort === 'name' ? pickString(a, ['name']).localeCompare(pickString(b, ['name'])) :
      new Date(pickString(a, ['latest_activity_at', 'updated_at'])).getTime() - new Date(pickString(b, ['latest_activity_at', 'updated_at'])).getTime();
    return ascending ? result : -result;
  });
  return <View style={nested ? styles.indent : undefined}>
    {!nested ? <Pressable onPress={() => onChoose(null)}><Text style={[styles.name, {color: colors.accentLight}]}>{t('library.root', {defaultValue: 'Library root'})}</Text></Pressable> : null}
    {ordered.map(folder => {
      const id = pickNumber(folder, ['id']);
      const children = pickArray(folder, ['children']).filter(isRecord);
      return <View key={id}>
        <View style={styles.row}>
          {children.length ? <Pressable style={styles.expand} accessibilityRole="button" accessibilityState={{ expanded: expanded.includes(id) }} accessibilityLabel={t('library.expandFolder', {defaultValue: 'Expand or collapse {{name}}', name: pickString(folder, ['name'])})} onPress={() => setExpanded(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])}><Text style={{color: colors.text}}>{expanded.includes(id) ? '▼' : '▶'}</Text></Pressable> : null}
          <Pressable style={styles.flex} onPress={() => onChoose(id)}><Text numberOfLines={wrap ? undefined : 1} style={[styles.name, {color: colors.text}]}>{pickString(folder, ['name'])}</Text></Pressable>
        </View>
        {expanded.includes(id) && children.length ? <LibraryFolderTree tree={children} sort={sort} ascending={ascending} collapsed={collapsed} wrap={wrap} onChoose={onChoose} nested /> : null}
      </View>;
    })}
  </View>;
}
const styles = StyleSheet.create({ indent: {paddingLeft: spacing.lg}, row: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm}, name: {paddingVertical: spacing.sm}, flex: {flex: 1}, expand: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' } });
