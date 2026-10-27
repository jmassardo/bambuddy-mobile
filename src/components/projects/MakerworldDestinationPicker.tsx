import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { PrimaryButton, SearchBar } from '@/components/common/AppUI';
import { ErrorState } from '@/components/common/StateScreens';
import { useTheme } from '@/theme';
import { useTranslation } from '@/i18n';
import { spacing } from '@/theme/tokens';
import { makerworldDestinations } from '@/utils/makerworld';
import { pickNumber, pickString, type ApiRecord } from '@/utils/data';

export function MakerworldDestinationPicker({ value, onChange, disabled }: {
  value: number | null;
  onChange: (id: number | null) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState('');
  const query = useQuery({ queryKey: ['libraryFolders'], queryFn: () => api.getLibraryFolders() });
  const folders = makerworldDestinations((query.data ?? []) as ApiRecord[]);
  const choose = (id: number | null) => { onChange(id); setVisible(false); };
  const auto = t('makerworld.folderAuto', { defaultValue: 'Auto (MakerWorld folder)' });
  return <>
    <PrimaryButton variant="secondary" disabled={disabled}
      label={t('makerworld.destination', { defaultValue: 'Destination: {{name}}', name: value === null ? auto : pickString(folders.find(row => row.folder.id === value)?.folder, ['name'], String(value)) })}
      onPress={() => setVisible(true)} />
    <Modal visible={visible} animationType="slide" onRequestClose={() => setVisible(false)}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <SearchBar value={search} onChangeText={setSearch} placeholder={t('makerworld.searchFolders', { defaultValue: 'Search destination folders' })} />
        {query.isError ? <ErrorState message={t('makerworld.foldersError', { defaultValue: 'Unable to load destination folders.' })} onRetry={() => void query.refetch()} /> : null}
        <ScrollView contentContainerStyle={styles.list}>
          <PrimaryButton label={auto} variant="secondary" onPress={() => choose(null)} />
          {folders.filter(row => pickString(row.folder, ['name']).toLowerCase().includes(search.toLowerCase())).map(({ folder, depth }) => <PrimaryButton
            key={pickNumber(folder, ['id'])} variant="secondary" label={`${'— '.repeat(depth)}${pickString(folder, ['name'])}`}
            onPress={() => choose(pickNumber(folder, ['id']))} />)}
        </ScrollView>
        <PrimaryButton label={t('common.cancel')} variant="secondary" onPress={() => setVisible(false)} />
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, paddingTop: spacing['3xl'], gap: spacing.sm },
  list: { gap: spacing.sm },
});
