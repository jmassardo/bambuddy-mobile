import { nativeMessage, translateNative, useNativeLocale, useNativeMessageState, useTranslation } from '@/i18n';
import { localizedStatus } from '@/utils/statusLabel';

import React, { useRef } from 'react';
import { Text } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PrimaryButton,
  SectionCard,
  TextField,
} from '@/components/common/AppUI';
import { workflowSettingsApi } from '@/api/workflowSettings';
import { printersApi } from '@/api/printers';

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
  useNativeLocale();
  const { t } = useTranslation();
  const { draft } = controller.state;
  const { setDraft } = controller.actions;
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ['workflow-obico-status'],
    queryFn: workflowSettingsApi.getDetectionStatus,
    refetchInterval: 10000,
  });
  const [testMessage, setTestMessage] = useNativeMessageState('');
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
          result.error ?? result.body ?? translateNative('native.3f24c1778d182094', { value0: String(result.status_code ?? '?') }),
        );
      if (editRevision.current !== revision) {
        setTestMessage(
          nativeMessage('workflow.testChanged', () => ({
            defaultValue:
              'Configuration changed during the test. Save and test the pending edits again.',
          })),
        );
        return;
      }
      setTestMessage(
        result.auth_ok === null ? nativeMessage('workflow.testTokenUnknown', () => ({
              defaultValue:
                'Service reachable. Token authentication could not be verified.',
            })) : nativeMessage('workflow.testHealthy', () => ({
              defaultValue:
                'Saved configuration is reachable; authentication accepted.',
            })),
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
        title={fieldLabel('failureDetection', translateNative('native.8d9d76d1eabcbf13'))}
        subtitle={fieldLabel(
          'failureDetectionHelp',
          translateNative('native.3f7a17e9127e2900'),
        )}
      >
        <SwitchRow
          label={fieldLabel('obico_enabled', translateNative('native.ce4bb5bfb5837958'))}
          value={draft.obico_enabled === true}
          onValueChange={value => set('obico_enabled', value)}
        />
        <TextField
          label={fieldLabel('obico_ml_url', translateNative('native.301fd81a82ae3258'))}
          value={String(draft.obico_ml_url ?? '')}
          onChangeText={value => set('obico_ml_url', value)}
          autoCapitalize="none"
        />
        <TextField
          label={fieldLabel('obico_ml_token', translateNative('native.b60124149c2a461f'))}
          value={String(draft.obico_ml_token ?? '')}
          onChangeText={value => set('obico_ml_token', value)}
          autoCapitalize="none"
          secureTextEntry
        />
        <OptionChipsField
          label={fieldLabel('sensitivity', translateNative('native.e1ff2cad9ddd16a9'))}
          value={String(draft.obico_sensitivity ?? 'medium')}
          options={['low', 'medium', 'high'].map(key => ({
            key,
            label: localizedStatus(key),
          }))}
          onChange={value => set('obico_sensitivity', value)}
        />
        <OptionChipsField
          label={fieldLabel('action', translateNative('native.97af5b0829e9bf70'))}
          value={String(draft.obico_action ?? 'notify')}
          options={[
            { key: 'notify', label: fieldLabel('notify', translateNative('native.8cfae299f560cf4b')) },
            { key: 'pause', label: fieldLabel('pause', translateNative('native.362b1658df45e7f1')) },
            {
              key: 'pause_and_off',
              label: fieldLabel('pauseAndOff', translateNative('native.cf8aad8108008103')),
            },
          ]}
          onChange={value => set('obico_action', value)}
        />
        <WorkflowNumberField
          label={fieldLabel('pollInterval', translateNative('native.ae2994813541c587'))}
          value={Number(draft.obico_poll_interval ?? 10)}
          min={5}
          max={120}
          onChange={value => set('obico_poll_interval', value)}
        />
        <OptionChipsField
          label={fieldLabel('monitorPrinters', translateNative('native.4d49bd96125df144'))}
          value={selected === null ? 'all' : 'custom'}
          options={[
            { key: 'all', label: fieldLabel('allPrinters', translateNative('native.b8ed6cb4c204100e')) },
            {
              key: 'custom',
              label: fieldLabel('customPrinters', translateNative('native.ac3448f3d6c08f52')),
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
              translateNative('native.9797a6ebd6b2260c'),
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
              translateNative('native.04d329a6a33d2583'),
            )}
          </Text>
        ) : null}
        <PrimaryButton
          label={fieldLabel(
            'saveFailureDetection',
            translateNative('native.13c6d2b8cd0e4479'),
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
          label={fieldLabel('saveAndTest', translateNative('native.b24c14516c4998c4'))}
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
          translateNative('native.df5f291e69734133'),
        )}
      >
        {status.isError && status.data ? (
          <Text
            style={[settingsStyles.helper, { color: controller.colors.error }]}
          >
            {fieldLabel(
              'statusStale',
              translateNative('native.b3941b491472a05c'),
            )}
          </Text>
        ) : null}
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
                  translateNative('native.537ededb34c40e00'),
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
                  translateNative('native.8001c7c92b376503'),
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
                  translateNative('native.d2ac42f573b54355', { value0: String(id) })}
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
                  translateNative('native.765c140b3f1c14ab'),
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
        title={fieldLabel('detectionHistory', translateNative('native.45fa378cf68ce1b3'))}
      >
        {status.isError && !status.data ? (
          <Text
            style={[settingsStyles.helper, { color: controller.colors.error }]}
          >
            {fieldLabel('historyUnavailable', translateNative('native.aec6de6263313bb7'))}
          </Text>
        ) : !status.data?.history.length ? (
          <Text
            style={[
              settingsStyles.helper,
              { color: controller.colors.textSecondary },
            ]}
          >
            {fieldLabel('noHistory', translateNative('native.349ea05cb90b03c2'))}
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
