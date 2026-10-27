import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { PrimaryButton } from '@/components/common/AppUI';
import {
  Choice,
  LaunchText,
  PrintOptionsForm,
} from '@/components/printers/PrintOptionsForm';
import { PrintSchedulePicker } from '@/components/printers/PrintSchedulePicker';
import { useTheme } from '@/theme';
import { useTranslation } from '@/i18n';
import { spacing } from '@/theme/tokens';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Printer, PrintQueueItemUpdate } from '@/types/api';
import { scheduleTime } from '@/utils/printLaunch';

export function QueueBulkEditModal({
  visible,
  count,
  printers,
  loading,
  onClose,
  onSave,
}: {
  visible: boolean;
  count: number;
  printers: Printer[];
  loading: boolean;
  onClose: () => void;
  onSave: (value: PrintQueueItemUpdate) => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: api.getSettings,
    enabled: visible,
  });
  const [draft, setDraft] = useState<PrintQueueItemUpdate>({});
  const [schedule, setSchedule] = useState('unchanged');
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (visible) {
      setDraft({});
      setSchedule('unchanged');
      setDate('');
      setError('');
    }
  }, [visible]);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <LaunchText>
            {t('printing.bulkCount', {
              defaultValue: 'Bulk edit {{count}} selected pending jobs',
              count,
            })}
          </LaunchText>
          <LaunchText>
            Unchanged fields are omitted. Only selected, permitted pending items
            are changed.
          </LaunchText>
          <Choice<number | null | undefined>
            label="Assign printer"
            value={draft.printer_id}
            options={[
              { value: undefined, label: 'Unchanged' },
              { value: null, label: 'Unassigned' },
              ...printers
                .filter(p => p.is_active)
                .map(p => ({
                  value: p.id,
                  label: `${p.name} · ${p.model ?? ''}`,
                })),
            ]}
            onChange={printer_id => setDraft({ ...draft, printer_id })}
          />
          <Choice
            label="Scheduled time"
            value={schedule}
            options={[
              { value: 'unchanged', label: 'Unchanged' },
              { value: 'asap', label: 'Clear scheduled time' },
              { value: 'scheduled', label: 'Scheduled' },
            ]}
            onChange={setSchedule}
          />
          {schedule === 'scheduled' && (
            <PrintSchedulePicker value={date} onChange={setDate} />
          )}
          <PrintOptionsForm
            value={draft}
            onChange={setDraft}
            bulk
            dualNozzle={printers.some(p => p.nozzle_count > 1)}
            injectionAllowed={!!settings.data?.gcode_snippets}
            canControl={hasPermission('printers:control')}
          />
          {error ? <LaunchText>{error}</LaunchText> : null}
        </ScrollView>
        <View style={styles.row}>
          <PrimaryButton
            label={t('common.cancel', { defaultValue: 'Cancel' })}
            variant="secondary"
            disabled={loading}
            onPress={onClose}
          />
          <PrimaryButton
            label={t('common.apply', { defaultValue: 'Apply' })}
            loading={loading}
            disabled={loading}
            onPress={() => {
              try {
                const target = draft.preheat_chamber_target_override;
                if (
                  target != null &&
                  (!Number.isInteger(target) || target < 0 || target > 65)
                )
                  throw new Error(
                    t('printing.invalidTarget', {
                      defaultValue:
                        'Chamber target must be an integer from 0 to 65 °C.',
                    }),
                  );
                const changes = {
                  ...draft,
                  ...(schedule !== 'unchanged'
                    ? { scheduled_time: scheduleTime(schedule, date) }
                    : {}),
                };
                if (!Object.values(changes).some(v => v !== undefined))
                  throw new Error(
                    t('printing.noChanges', {
                      defaultValue: 'Choose at least one change.',
                    }),
                  );
                onSave(changes);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
          />
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.md, paddingTop: spacing.xl },
  content: { paddingBottom: spacing.xl },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
});
