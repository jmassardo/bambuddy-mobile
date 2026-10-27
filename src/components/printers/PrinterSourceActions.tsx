import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useServerStore } from '@/api/server';
import { PrimaryButton } from '@/components/common/AppUI';
import { ConfirmOutcomeDialog } from '@/components/archives/ArchiveWorkflowUI';
import { PrintModal } from '@/components/printers/PrintModal';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTranslation } from '@/i18n';
import { useTheme } from '@/theme';
import { fontSize, spacing } from '@/theme/tokens';

export function PrinterSourceActions({ printerId }: { printerId: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { user, hasPermission } = useAuth();
  const { showToast } = useToast();
  const client = useQueryClient();
  const serverUrl = useServerStore(state => state.serverUrl);
  const [outcomeId, setOutcomeId] = useState<number | null>(null);
  const [launch, setLaunch] = useState<'upload' | number | null>(null);
  const canUpload =
    hasPermission('queue:create') && hasPermission('library:upload');
  const readAll = hasPermission('archives:read_all');
  const readOwn = hasPermission('archives:read_own');
  const canRead = hasPermission('archives:read') || readAll || readOwn;
  const updateAll = hasPermission('archives:update_all');
  const updateOwn = hasPermission('archives:update_own');
  const latestQuery = useQuery({
    queryKey: [
      'archives',
      'printerOutcome',
      serverUrl,
      user?.id ?? null,
      printerId,
      canRead,
      readAll,
      readOwn,
      updateAll,
      updateOwn,
    ],
    queryFn: () => api.getArchives({ printerId, limit: 1, offset: 0 }),
    enabled: canRead && (updateAll || updateOwn),
  });
  const latest = latestQuery.data?.[0];
  const pending =
    canRead &&
    latest?.status === 'completed' &&
    latest.confirm_requested === true &&
    latest.user_verdict == null &&
    (updateAll ||
      (user != null && latest.created_by_id === user.id && updateOwn));
  const good = useMutation({
    mutationFn: (id: number) =>
      api.updateArchive(id, {
        user_verdict: 'good',
        user_verdict_source: 'printer_card',
        failure_reason: null,
      }),
    onSuccess: async (_, id) => {
      await Promise.all(
        [
          ['archives'],
          ['archive', id],
          ['failureAnalysis'],
          ['stats'],
          ['archiveStats'],
          ['projects'],
          ['printers'],
          ['printer', printerId],
          ['printerStatus', printerId],
        ].map(queryKey => client.invalidateQueries({ queryKey })),
      );
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });

  if (!canUpload && !pending && outcomeId === null && launch === null)
    return null;

  return (
    <View style={styles.container}>
      {canUpload ? (
        <PrimaryButton
          label={t('printerSources.uploadPrint', {
            defaultValue: 'Upload & Print',
          })}
          variant="secondary"
          onPress={() => setLaunch('upload')}
        />
      ) : null}
      {pending && latest ? (
        <View style={styles.outcome}>
          <Text style={[styles.label, { color: colors.text }]}>
            {t('printerSources.pendingOutcome', {
              defaultValue: 'Confirm outcome: {{name}}',
              name: latest.print_name || latest.filename,
            })}
          </Text>
          <View style={styles.actions}>
            <PrimaryButton
              label={t('printerSources.good', { defaultValue: 'Good' })}
              disabled={good.isPending}
              loading={good.isPending}
              onPress={() => good.mutate(latest.id)}
            />
            <PrimaryButton
              label={t('printerSources.reject', { defaultValue: 'Reject' })}
              variant="secondary"
              disabled={good.isPending}
              onPress={() => setOutcomeId(latest.id)}
            />
          </View>
        </View>
      ) : null}
      {outcomeId !== null ? (
        <ConfirmOutcomeDialog
          archiveId={outcomeId}
          onClose={() => setOutcomeId(null)}
          onReprint={setLaunch}
        />
      ) : null}
      {launch !== null ? (
        <PrintModal
          visible
          onClose={() => setLaunch(null)}
          initialPrinterId={printerId}
          initialMode="asap"
          {...(launch === 'upload'
            ? { uploadForPrinter: true }
            : { initialArchiveId: launch })}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  outcome: { gap: spacing.xs },
  label: { fontSize: fontSize.sm },
  actions: { flexDirection: 'row', gap: spacing.sm },
});
