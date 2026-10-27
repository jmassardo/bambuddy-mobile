import React, { useState } from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { request } from '@/api/http';
import { filesApi } from '@/api/files';
import { Chip, PrimaryButton, SearchBar } from '@/components/common/AppUI';
import { useToast } from '@/contexts/ToastContext';
import { useTranslation } from '@/i18n';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import { isRecord, pickArray, pickNumber, pickString, type ApiRecord } from '@/utils/data';

export function FolderAssociation({ folder, onSaved }: {folder: ApiRecord; onSaved: () => void}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { showToast } = useToast();
  const client = useQueryClient();
  const [kind, setKind] = useState<'project' | 'archive'>(folder.archive_id ? 'archive' : 'project');
  const [target, setTarget] = useState<number | null>(pickNumber(folder, [kind === 'project' ? 'project_id' : 'archive_id']) || null);
  const [search, setSearch] = useState('');
  const targets = useQuery({
    queryKey: ['folderAssociationTargets', kind],
    queryFn: async () => {
      if (kind === 'project') return request<ApiRecord[]>('/projects/');
      const all: ApiRecord[] = [];
      let offset = 0;
      while (true) {
        const page = await request<unknown>(`/archives/?limit=100&offset=${offset}`);
        const rows = Array.isArray(page) ? page.filter(isRecord) : pickArray(isRecord(page) ? page : {}, ['items', 'archives']).filter(isRecord);
        all.push(...rows);
        if (rows.length < 100) break;
        offset += rows.length;
      }
      return all;
    },
  });
  const save = useMutation({
    mutationFn: () => filesApi.updateLibraryFolder(pickNumber(folder, ['id']), {
      project_id: kind === 'project' ? target ?? 0 : 0,
      archive_id: kind === 'archive' ? target ?? 0 : 0,
    }),
    onSuccess: async () => {
      await Promise.all(['libraryFolders', 'projects', 'archives', 'project', 'archive', 'projectFolders', 'projectFiles', 'projectArchives', 'projectFileProgress', 'projectActionArchives', 'archiveFolders'].map(key => client.invalidateQueries({ queryKey: [key] })));
      onSaved();
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const rows = (Array.isArray(targets.data) ? targets.data.filter(isRecord) : []);
  return <>
    <Text style={{ color: colors.text }}>{t('library.currentAssociation', { defaultValue: 'Current association: {{name}}', name: pickString(folder, ['project_name', 'archive_name'], t('library.none', { defaultValue: 'None' })) })}</Text>
    <ScrollView horizontal contentContainerStyle={styles.row}>
      {(['project', 'archive'] as const).map(value => <Chip key={value} label={t(`library.${value}`, { defaultValue: value })} selected={kind === value} onPress={() => { setKind(value); setTarget(null); }} />)}
      <Chip label={t('library.unlink', { defaultValue: 'Unlink' })} selected={target === null} onPress={() => setTarget(null)} />
    </ScrollView>
    <SearchBar value={search} onChangeText={setSearch} placeholder={t('library.findTarget', { defaultValue: 'Find project or archive' })} />
    <ScrollView style={styles.list}>
      {rows.filter(row => pickString(row, ['name', 'print_name', 'filename']).toLowerCase().includes(search.toLowerCase())).map(row => <Chip key={pickNumber(row, ['id'])} label={pickString(row, ['name', 'print_name', 'filename'])} selected={target === pickNumber(row, ['id'])} onPress={() => setTarget(pickNumber(row, ['id']))} />)}
      {targets.isError ? <PrimaryButton label={t('common.retry', { defaultValue: 'Retry' })} onPress={() => void targets.refetch()} /> : null}
    </ScrollView>
    <PrimaryButton label={t('common.save')} onPress={() => save.mutate()} disabled={save.isPending || targets.isLoading} />
  </>;
}
const styles = StyleSheet.create({ row: { gap: spacing.sm }, list: { maxHeight: 320 } });
