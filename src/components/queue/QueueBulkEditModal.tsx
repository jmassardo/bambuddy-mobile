import { translateNative, useNativeLocale, useNativeMessageState, useTranslation } from '@/i18n';

import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/common/AppUI';
import {
  Choice,
  LaunchText,
  PrintOptionsForm,
} from '@/components/printers/PrintOptionsForm';
import { PrintSchedulePicker } from '@/components/printers/PrintSchedulePicker';
import { useTheme } from '@/theme';

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
  allowFixedPrinterAssignment = true,
  onClose,
  onSave,
}: {
  visible: boolean;
  count: number;
  printers: Printer[];
  loading: boolean;
  allowFixedPrinterAssignment?: boolean;
  onClose: () => void;
  onSave: (value: PrintQueueItemUpdate) => void;
}) {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const settings = useQuery({
    queryKey: useServerSettingsKey(),
    queryFn: api.getSettings,
    enabled: visible,
  });
  const [draft, setDraft] = useState<PrintQueueItemUpdate>({});
  const [schedule, setSchedule] = useState('unchanged');
  const [date, setDate] = useState('');
  const [error, setError] = useNativeMessageState('');
  const assignmentError = t('printing.unresolvedVariantAssignment', {
    defaultValue:
      'Jobs with unresolved alternative slices cannot be assigned a fixed printer. Leave the printer unchanged or unassigned.',
  });
  useEffect(() => {
    if (visible) {
      setDraft({});
      setSchedule('unchanged');
      setDate('');
      setError('');
    }
  }, [setError, visible]);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
      <SafeAreaView edges={{ top: 'maximum', bottom: 'maximum', left: 'maximum', right: 'maximum' }} style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.viewport} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <LaunchText>
            {t('printing.bulkCount', {
              defaultValue: 'Bulk edit {{count}} selected pending jobs',
              count,
            })}
          </LaunchText>
          <LaunchText>
            {translateNative('native.062fba0ae629823f')}</LaunchText>
          <Choice<number | null | undefined>
            label={translateNative('native.3e31748a12aa3823')}
            value={draft.printer_id}
            options={[
              { value: undefined, get label() { return translateNative('native.6ae0647a123bb8da'); } },
              { value: null, get label() { return translateNative('native.424849cf8f869437'); } },
              ...printers
                .filter(p => p.is_active)
                .map(p => ({
                  value: p.id,
                  label: `${p.name} · ${p.model ?? ''}`,
                  disabled: !allowFixedPrinterAssignment,
                })),
            ]}
            onChange={printer_id => setDraft({ ...draft, printer_id })}
          />
          {!allowFixedPrinterAssignment && (
            <LaunchText>{assignmentError}</LaunchText>
          )}
          <Choice
            label={translateNative('native.edcd0a3cf3a2c4e0')}
            value={schedule}
            options={[
              { value: 'unchanged', get label() { return translateNative('native.6ae0647a123bb8da'); } },
              { value: 'asap', get label() { return translateNative('native.9ec66b738a910c59'); } },
              { value: 'scheduled', get label() { return translateNative('native.6ad7336d402e07da'); } },
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
                if (!allowFixedPrinterAssignment && draft.printer_id != null)
                  throw new Error(assignmentError);
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
        </KeyboardAvoidingView>
        </SafeAreaView>
        </SafeAreaProvider>
    </Modal>
  );
}
const styles = StyleSheet.create({
  viewport: { flex: 1 },
  container: { flex: 1, padding: spacing.md, paddingTop: spacing.xl },
  content: { paddingBottom: spacing.xl },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
});
import { useServerSettingsKey } from '@/hooks/useServerSettingsKey';
