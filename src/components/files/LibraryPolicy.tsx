import { nativeMessage, useNativeLocale, useTranslation } from '@/i18n';

import React, { useEffect, useState } from 'react';
import { Switch, Text, View, StyleSheet } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { filesApi } from '@/api/files';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import type { LibraryTrashSettings } from '@/types/api';
import { validDays } from '@/utils/library';
import { PrimaryButton, SectionCard, TextField } from '@/components/common/AppUI';

export function LibraryPolicy() {
  useNativeLocale();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { hasPermission } = useAuth();
  const allowed = hasPermission('library:purge');
  const { showToast } = useToast();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['libraryTrashSettings'], queryFn: filesApi.getLibraryTrashSettings, enabled: allowed });
  const [policy, setPolicy] = useState<LibraryTrashSettings | null>(null);
  const [retention, setRetention] = useState('');
  const [age, setAge] = useState('');
  useEffect(() => {
    if (query.data) {
      setPolicy(query.data);
      setRetention(String(query.data.retention_days));
      setAge(String(query.data.auto_purge_days));
    }
  }, [query.data]);
  const save = useMutation({
    mutationFn: () => filesApi.saveLibraryTrashSettings({
      ...policy!,
      retention_days: validDays(retention, 1, 365)!,
      auto_purge_days: validDays(age, 7)!,
    }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['libraryTrashSettings'] }),
        client.invalidateQueries({ queryKey: ['libraryTrash'] }),
      ]);
      showToast(nativeMessage('library.policySaved', () => ({ defaultValue: 'Trash policy saved.' })), 'success');
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  if (!allowed) return null;
  return (
    <SectionCard title={t('library.retention', { defaultValue: 'Retention and automatic cleanup' })}>
      {query.isError ? <PrimaryButton label={t('common.retry', { defaultValue: 'Retry' })} onPress={() => void query.refetch()} /> : null}
      {policy ? <>
        <TextField label={t('library.retentionDays', { defaultValue: 'Trash retention days (1–365)' })} value={retention} onChangeText={setRetention} keyboardType="number-pad" />
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.text }]}>{t('library.autoPurge', { defaultValue: 'Automatically move old library files to trash' })}</Text>
          <Switch value={policy.auto_purge_enabled} onValueChange={value => setPolicy({ ...policy, auto_purge_enabled: value })} />
        </View>
        <TextField label={t('library.autoAge', { defaultValue: 'Automatic purge age in days (7–3650)' })} value={age} onChangeText={setAge} keyboardType="number-pad" />
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.text }]}>{t('library.includeNever', { defaultValue: 'Include never printed files' })}</Text>
          <Switch value={policy.auto_purge_include_never_printed} onValueChange={value => setPolicy({ ...policy, auto_purge_include_never_printed: value })} />
        </View>
        <PrimaryButton label={t('common.save')} onPress={() => save.mutate()} disabled={save.isPending || validDays(retention, 1, 365) === null || validDays(age, 7) === null} />
      </> : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, label: { flex: 1 } });
