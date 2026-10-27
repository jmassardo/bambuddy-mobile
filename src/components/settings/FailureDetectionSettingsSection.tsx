import React, { useRef, useState } from 'react';
import { Text } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PrimaryButton,
  SectionCard,
  TextField,
} from '@/components/common/AppUI';
import { workflowSettingsApi } from '@/api/workflowSettings';
import { printersApi } from '@/api/printers';
import { useTranslation } from '@/i18n';
import { aiDetectionSummary } from '@/utils/aiDetection';
import { OptionChipsField, SwitchRow, settingsStyles } from './shared';
import { WorkflowNumberField } from './WorkflowFields';
import type { SettingsScreenController } from './useSettingsScreenController';

export function monitoredPrinterIds(value: unknown): number[] | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(String(value));
    return Array.isArray(parsed) && parsed.every(Number.isInteger)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function FailureDetectionSettingsSection({
  controller,
}: {
  controller: SettingsScreenController;
}) {
  const { t } = useTranslation();
  const { draft } = controller.state;
  const { setDraft } = controller.actions;
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ['workflow-obico-status'],
    queryFn: workflowSettingsApi.getDetectionStatus,
    refetchInterval: 10000,
  });
  const [testMessage, setTestMessage] = useState('');
  const editRevision = useRef(0);
  const save = useMutation({
    mutationFn: async () => {
      await controller.mutations.saveSettingsMutation.mutateAsync();
      await Promise.all([
        status.refetch(),
        queryClient.invalidateQueries({ queryKey: ['obico-printer-status'] }),
      ]);
    },
  });
  const test = useMutation({
    mutationFn: async () => {
      setTestMessage('');
      const revision = editRevision.current;
      const url = String(draft.obico_ml_url ?? '');
      const token = String(draft.obico_ml_token ?? '');
      // The service reads persisted settings, so a healthy test must follow a successful save.
      await controller.mutations.saveSettingsMutation.mutateAsync();
      const result = await workflowSettingsApi.testDetection(url, token);
      if (!result.ok)
        throw new Error(
          result.error ?? result.body ?? `HTTP ${result.status_code ?? '?'}`,
        );
      if (editRevision.current !== revision) {
        setTestMessage(
          t('workflow.testChanged', {
            defaultValue:
              'Configuration changed during the test. Save and test the pending edits again.',
          }),
        );
        return;
      }
      setTestMessage(
        result.auth_ok === null
          ? t('workflow.testTokenUnknown', {
              defaultValue:
                'Service reachable. Token authentication could not be verified.',
            })
          : t('workflow.testHealthy', {
              defaultValue:
                'Saved configuration is reachable; authentication accepted.',
            }),
      );
      await Promise.all([
        status.refetch(),
        queryClient.invalidateQueries({ queryKey: ['obico-printer-status'] }),
      ]);
    },
  });
  const selected = monitoredPrinterIds(draft.obico_enabled_printers);
  const printersQuery = useQuery({
    queryKey: ['printers'],
    queryFn: printersApi.getPrinters,
  });
  const printers = printersQuery.data ?? [];
  const fieldLabel = (key: string, label: string) =>
    t(`workflow.${key}`, { defaultValue: label });
  const set = (key: string, value: unknown) => {
    editRevision.current += 1;
    setTestMessage('');
    setDraft(current => ({ ...current, [key]: value }));
  };
  return (
    <>
      <SectionCard
        title={fieldLabel('failureDetection', 'Failure detection')}
        subtitle={fieldLabel(
          'failureDetectionHelp',
          'Obico ML service configuration. Test saves pending settings before verifying runtime credentials.',
        )}
      >
        <SwitchRow
          label={fieldLabel('obico_enabled', 'Failure detection enabled')}
          value={draft.obico_enabled === true}
          onValueChange={value => set('obico_enabled', value)}
        />
        <TextField
          label={fieldLabel('obico_ml_url', 'Server URL')}
          value={String(draft.obico_ml_url ?? '')}
          onChangeText={value => set('obico_ml_url', value)}
          autoCapitalize="none"
        />
        <TextField
          label={fieldLabel('obico_ml_token', 'ML token')}
          value={String(draft.obico_ml_token ?? '')}
          onChangeText={value => set('obico_ml_token', value)}
          autoCapitalize="none"
          secureTextEntry
        />
        <OptionChipsField
          label={fieldLabel('sensitivity', 'Sensitivity')}
          value={String(draft.obico_sensitivity ?? 'medium')}
          options={['low', 'medium', 'high'].map(key => ({
            key,
            label: fieldLabel(key, key),
          }))}
          onChange={value => set('obico_sensitivity', value)}
        />
        <OptionChipsField
          label={fieldLabel('action', 'Action')}
          value={String(draft.obico_action ?? 'notify')}
          options={[
            { key: 'notify', label: fieldLabel('notify', 'Notify') },
            { key: 'pause', label: fieldLabel('pause', 'Pause') },
            {
              key: 'pause_and_off',
              label: fieldLabel('pauseAndOff', 'Pause + power off'),
            },
          ]}
          onChange={value => set('obico_action', value)}
        />
        <WorkflowNumberField
          label={fieldLabel('pollInterval', 'Poll interval (seconds)')}
          value={Number(draft.obico_poll_interval ?? 10)}
          min={5}
          max={120}
          onChange={value => set('obico_poll_interval', value)}
        />
        <OptionChipsField
          label={fieldLabel('monitorPrinters', 'Monitored printers')}
          value={selected === null ? 'all' : 'custom'}
          options={[
            { key: 'all', label: fieldLabel('allPrinters', 'All printers') },
            {
              key: 'custom',
              label: fieldLabel('customPrinters', 'Choose printers'),
            },
          ]}
          onChange={value =>
            set(
              'obico_enabled_printers',
              value === 'all'
                ? ''
                : JSON.stringify(printers.map(printer => printer.id)),
            )
          }
        />
        {selected !== null
          ? printers.map(printer => (
              <SwitchRow
                key={printer.id}
                label={printer.name}
                value={selected.includes(printer.id)}
                onValueChange={checked =>
                  set(
                    'obico_enabled_printers',
                    JSON.stringify(
                      checked
                        ? [...new Set([...selected, printer.id])]
                        : selected.filter(id => id !== printer.id),
                    ),
                  )
                }
              />
            ))
          : null}
        {printersQuery.isError ? (
          <Text
            style={[settingsStyles.helper, { color: controller.colors.error }]}
          >
            {fieldLabel(
              'printerTargetsUnavailable',
              'Unable to load printers. The saved monitored-printer selection is preserved.',
            )}
          </Text>
        ) : null}
        {selected?.length === 0 ? (
          <Text
            style={[
              settingsStyles.helper,
              { color: controller.colors.warning },
            ]}
          >
            {fieldLabel(
              'noMonitoredPrinters',
              'No printers selected. No printers will be monitored.',
            )}
          </Text>
        ) : null}
        <PrimaryButton
          label={fieldLabel(
            'saveFailureDetection',
            'Save failure-detection settings',
          )}
          onPress={() => save.mutate()}
          loading={save.isPending}
          disabled={
            !controller.permissions.canUpdateSettings ||
            save.isPending ||
            test.isPending
          }
        />
        <PrimaryButton
          label={fieldLabel('saveAndTest', 'Save and test connection')}
          variant="secondary"
          onPress={() => test.mutate()}
          loading={test.isPending}
          disabled={
            !controller.permissions.canUpdateSettings ||
            save.isPending ||
            test.isPending ||
            !String(draft.obico_ml_url ?? '').trim()
          }
        />
        {testMessage || test.error ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[
              settingsStyles.helper,
              {
                color: test.error
                  ? controller.colors.error
                  : controller.colors.text,
              },
            ]}
          >
            {test.error?.message ?? testMessage}
          </Text>
        ) : null}
      </SectionCard>
      <SectionCard
        title={fieldLabel(
          'effectiveDetectionStatus',
          'Effective service diagnostics',
        )}
      >
        {status.data ? (
          <>
            <Text
              style={[settingsStyles.helper, { color: controller.colors.text }]}
            >
              {t('workflow.serviceState', {
                defaultValue: 'Enabled: {{enabled}} • Running: {{running}}',
                enabled: String(status.data.enabled),
                running: String(status.data.is_running),
              })}
            </Text>
            <Text
              style={[
                settingsStyles.helper,
                { color: controller.colors.textSecondary },
              ]}
            >
              {t('workflow.thresholds', {
                defaultValue:
                  'Effective thresholds: {{low}} / {{high}} • {{sensitivity}} • {{action}} • {{interval}}s',
                ...status.data.thresholds,
                sensitivity: status.data.sensitivity,
                action: status.data.action,
                interval: status.data.poll_interval,
              })}
            </Text>
            {!status.data.external_url_configured ? (
              <Text
                style={[
                  settingsStyles.helper,
                  { color: controller.colors.warning },
                ]}
              >
                {fieldLabel(
                  'externalUrlMissing',
                  'External URL is not configured. The ML service must be able to reach this server for frames.',
                )}
              </Text>
            ) : null}
            {status.data.last_error ? (
              <Text
                selectable
                style={[
                  settingsStyles.helper,
                  { color: controller.colors.error },
                ]}
              >
                {status.data.last_error}
              </Text>
            ) : null}
            {!Object.keys(status.data.per_printer).length ? (
              <Text
                style={[
                  settingsStyles.helper,
                  { color: controller.colors.textSecondary },
                ]}
              >
                {fieldLabel(
                  'noDecisions',
                  'No printer decisions yet. Unmeasured printers are not classified as safe.',
                )}
              </Text>
            ) : null}
            {Object.entries(status.data.per_printer).map(([id, decision]) => (
              <Text
                key={id}
                selectable
                style={[
                  settingsStyles.helper,
                  { color: controller.colors.text },
                ]}
              >
                {printers.find(printer => String(printer.id) === id)?.name ??
                  `Printer ${id}`}
                : {aiDetectionSummary(decision)}
                {decision.error ? `\n${decision.error}` : ''}
              </Text>
            ))}
          </>
        ) : (
          <Text
            style={[
              settingsStyles.helper,
              { color: controller.colors.textSecondary },
            ]}
          >
            {status.isError
              ? fieldLabel(
                  'statusUnavailable',
                  'Failure-detection service status unavailable.',
                )
              : t('common.loading')}
          </Text>
        )}
        <PrimaryButton
          label={t('common.refresh', { defaultValue: 'Refresh' })}
          variant="secondary"
          onPress={() => void status.refetch()}
          loading={status.isFetching}
        />
      </SectionCard>
      <SectionCard
        title={fieldLabel('detectionHistory', 'Recent detection decisions')}
      >
        {!status.data?.history.length ? (
          <Text
            style={[
              settingsStyles.helper,
              { color: controller.colors.textSecondary },
            ]}
          >
            {fieldLabel('noHistory', 'No recent decisions.')}
          </Text>
        ) : (
          status.data.history.map((event, index) => (
            <Text
              key={`${event.timestamp}-${index}`}
              style={[settingsStyles.helper, { color: controller.colors.text }]}
            >
              {event.timestamp} •{' '}
              {printers.find(printer => printer.id === event.printer_id)
                ?.name ?? event.printer_id}{' '}
              • {event.class} • {event.score.toFixed(3)}
            </Text>
          ))
        )}
      </SectionCard>
    </>
  );
}
