import React, { useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton, SearchBar } from '@/components/common/AppUI';
import { useTranslation } from '@/i18n';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import { eligibleParents, projectTree } from '@/utils/projectHierarchy';
import { pickNumber, pickString, type ApiRecord } from '@/utils/data';

export function ProjectParentPicker({ projects, projectId, value, onChange }: {
  projects: ApiRecord[];
  projectId?: number;
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState('');
  const choices = useMemo(() => eligibleParents(projects, projectId), [projects, projectId]);
  const rows = projectTree(choices, new Set(choices.map(project => pickNumber(project, ['id']))))
    .filter(row => pickString(row.project, ['name']).toLowerCase().includes(search.toLowerCase()));
  const choose = (id: number | null) => { onChange(id); setVisible(false); };
  return (
    <>
      <PrimaryButton
        label={t('projects.parentChoice', { defaultValue: 'Parent: {{name}}', name: pickString(projects.find(project => project.id === value), ['name'], t('projects.noParent', { defaultValue: 'None (top level)' })) })}
        variant="secondary"
        onPress={() => setVisible(true)}
      />
      <Modal visible={visible} animationType="slide" onRequestClose={() => setVisible(false)}>
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <Text style={{ color: colors.text }}>{t('projects.chooseParent', { defaultValue: 'Choose parent project' })}</Text>
          <SearchBar value={search} onChangeText={setSearch} placeholder={t('projects.searchParent', { defaultValue: 'Search projects' })} />
          <ScrollView contentContainerStyle={styles.list}>
            <PrimaryButton variant="secondary" label={t('projects.noParent', { defaultValue: 'None (top level)' })} onPress={() => choose(null)} />
            {rows.map(({ project, depth }) => (
              <PrimaryButton key={pickNumber(project, ['id'])} variant="secondary"
                label={`${'— '.repeat(depth)}${pickString(project, ['name'])}`}
                onPress={() => choose(pickNumber(project, ['id']))} />
            ))}
          </ScrollView>
          <PrimaryButton label={t('common.cancel')} variant="secondary" onPress={() => setVisible(false)} />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, paddingTop: spacing['3xl'], gap: spacing.md },
  list: { gap: spacing.sm },
});
