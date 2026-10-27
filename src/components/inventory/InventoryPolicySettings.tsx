import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inventoryRequest } from '@/api/inventoryManagement';
import { settingsApi } from '@/api/settings';
import type { InventoryRecord } from '@/types/api';
import { parseNumber, text } from '@/utils/inventory';
import {
  InventoryButton as PrimaryButton,
  InventoryConfirm as ConfirmModal,
  useInventoryToast as useToast,
  ChoiceField,
  Fields,
  InventoryText,
  Toggle,
} from './InventoryControls';

export function AmsThresholdSettings() {
  const { showToast } = useToast();
  const client = useQueryClient();
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.getSettings(),
  });
  const [values, setValues] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    if (settings.data && !values)
      setValues({
        ams_humidity_good: text(settings.data, 'ams_humidity_good', '40'),
        ams_humidity_fair: text(settings.data, 'ams_humidity_fair', '60'),
        ams_temp_good: text(settings.data, 'ams_temp_good', '28'),
        ams_temp_fair: text(settings.data, 'ams_temp_fair', '35'),
        ams_temp_alarm: text(settings.data, 'ams_temp_alarm'),
      });
  }, [settings.data, values]);
  const save = useMutation({
    mutationFn: () => {
      const patch = Object.fromEntries(
        Object.entries(values ?? {}).map(([key, value]) => [
          key,
          parseNumber(
            value,
            key,
            key === 'ams_temp_alarm' ? 0.5 : 0,
            key.includes('humidity')
              ? 100
              : key === 'ams_temp_alarm'
              ? 120
              : 60,
            key === 'ams_temp_alarm',
          ),
        ]),
      );
      if (
        Number(patch.ams_humidity_good) >= Number(patch.ams_humidity_fair) ||
        Number(patch.ams_temp_good) >= Number(patch.ams_temp_fair)
      )
        throw new Error('Good must be below fair in each band.');
      return settingsApi.updateSettings(patch);
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['settings'] });
      showToast('AMS thresholds saved.', 'success');
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  return (
    <>
      <InventoryText>
        AMS display bands and independent temperature alarm
      </InventoryText>
      <Fields
        fields={[
          ['ams_humidity_good', 'Humidity good below (%)'],
          ['ams_humidity_fair', 'Humidity fair below (%)'],
          ['ams_temp_good', 'Temperature good below (°C)'],
          ['ams_temp_fair', 'Temperature fair below (°C)'],
          ['ams_temp_alarm', 'Temperature alarm (°C; blank disables)'],
        ]}
        values={values ?? {}}
        onChange={(key, value) => setValues(old => ({ ...old, [key]: value }))}
      />
      <PrimaryButton
        label="Save AMS bands and alarm"
        disabled={!values}
        loading={save.isPending}
        onPress={() => save.mutate()}
      />
    </>
  );
}
export function SpoolmanPolicySettings() {
  const { showToast } = useToast();
  const client = useQueryClient();
  const settings = useQuery({
    queryKey: ['inventorySpoolmanSettings'],
    queryFn: () => inventoryRequest('/settings/spoolman'),
  });
  const printers = useQuery({
    queryKey: ['printers'],
    queryFn: () => inventoryRequest<InventoryRecord[]>('/printers/'),
  });
  const [form, setForm] = useState<InventoryRecord | null>(null);
  const [scope, setScope] = useState('all');
  const [confirm, setConfirm] = useState<string | null>(null);
  const [result, setResult] = useState<InventoryRecord | null>(null);
  useEffect(() => {
    if (settings.data && !form) setForm(settings.data);
  }, [settings.data, form]);
  const mutation = useMutation({
    mutationFn: (operation: string) => {
      if (operation === 'save')
        return inventoryRequest('/settings/spoolman', 'PUT', form);
      if (operation === 'sync')
        return inventoryRequest(
          scope === 'all' ? '/spoolman/sync-all' : `/spoolman/sync/${scope}`,
          'POST',
        );
      return inventoryRequest(
        operation === 'internal'
          ? '/inventory/sync-ams-weights'
          : '/spoolman/inventory/sync-ams-weights',
        'POST',
      );
    },
    onSuccess: async (data, operation) => {
      setConfirm(null);
      if (operation !== 'save') setResult(data);
      await Promise.all(
        ['inventorySpoolmanSettings', 'inventorySpools', 'settings'].map(key =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      );
      showToast(
        operation === 'save'
          ? 'Spoolman policy saved.'
          : 'Synchronization finished. Review results below.',
        'success',
      );
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const setBool = (key: string, value: boolean) =>
    setForm(old => ({ ...old, [key]: value ? 'true' : 'false' }));
  return (
    <>
      <InventoryText>Spoolman synchronization policy</InventoryText>
      {settings.isError && (
        <InventoryText>{settings.error.message}</InventoryText>
      )}
      <Toggle
        label="Enabled"
        value={form?.spoolman_enabled === 'true'}
        onChange={value => setBool('spoolman_enabled', value)}
      />
      <Fields
        fields={[['spoolman_url', 'Spoolman URL']]}
        values={{ spoolman_url: text(form, 'spoolman_url') }}
        onChange={(key, value) => setForm(old => ({ ...old, [key]: value }))}
      />
      <ChoiceField
        label="Sync mode"
        value={text(form, 'spoolman_sync_mode', 'auto')}
        options={['auto', 'manual'].map(value => ({ value, label: value }))}
        onChange={value =>
          setForm(old => ({ ...old, spoolman_sync_mode: value }))
        }
      />
      <Toggle
        label="Disable weight sync"
        value={form?.spoolman_disable_weight_sync === 'true'}
        onChange={value => setBool('spoolman_disable_weight_sync', value)}
      />
      <Toggle
        label="Report partial usage"
        value={form?.spoolman_report_partial_usage !== 'false'}
        onChange={value => setBool('spoolman_report_partial_usage', value)}
      />
      <Toggle
        label="Auto-add unknown RFID"
        value={form?.auto_add_unknown_rfid !== 'false'}
        onChange={value => setBool('auto_add_unknown_rfid', value)}
      />
      <PrimaryButton
        label="Save Spoolman policy"
        loading={mutation.isPending}
        disabled={!form}
        onPress={() => mutation.mutate('save')}
      />
      <ChoiceField
        label="Sync printer scope"
        value={scope}
        options={[
          { value: 'all', label: 'All printers' },
          ...(printers.data ?? []).map(row => ({
            value: text(row, 'id'),
            label: text(row, 'name'),
          })),
        ]}
        onChange={setScope}
      />
      <PrimaryButton
        label="Synchronize printers to Spoolman"
        onPress={() => setConfirm('sync')}
      />
      <PrimaryButton
        label="Sync built-in inventory weights from AMS"
        variant="secondary"
        onPress={() => setConfirm('internal')}
      />
      <PrimaryButton
        label="Sync Spoolman weights from AMS"
        variant="secondary"
        onPress={() => setConfirm('spoolman')}
      />
      {result && (
        <InventoryText>{JSON.stringify(result, null, 2)}</InventoryText>
      )}
      <ConfirmModal
        visible={confirm !== null}
        title="Synchronize AMS inventory?"
        message={
          confirm === 'sync'
            ? 'This will synchronize the selected printer scope with Spoolman. Unidentified spools may be skipped.'
            : 'Live AMS remaining percentages will overwrite tracked weights for assigned spools. This can increase or decrease remaining stock.'
        }
        onClose={() => setConfirm(null)}
        onConfirm={() => mutation.mutate(confirm ?? 'sync')}
        loading={mutation.isPending}
      />
    </>
  );
}
