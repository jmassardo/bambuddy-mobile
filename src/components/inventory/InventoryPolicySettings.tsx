import { nativeLabelTuple, translateNative, useNativeLocale } from '@/i18n';

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
  useNativeLocale();
  const { showToast } = useToast();
  const client = useQueryClient();
  const settings = useQuery({
    queryKey: useServerSettingsKey(),
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
        throw new Error(translateNative('native.20d523bc09a6ff6e'));
      return settingsApi.updateSettings(patch);
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['settings'] });
      showToast(translateNative('native.2ea8f962809f8cfd'), 'success');
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  return (
    <>
      <InventoryText>
        {translateNative('native.c1aa660c68632f8f')}</InventoryText>
      <Fields
        fields={[
          nativeLabelTuple(['ams_humidity_good', 'native.cb0028cd92ed0112']),
          nativeLabelTuple(['ams_humidity_fair', 'native.5cc8d9f0aadeefc0']),
          nativeLabelTuple(['ams_temp_good', 'native.e15c2a34eb55ff05']),
          nativeLabelTuple(['ams_temp_fair', 'native.d659121f93cedbf5']),
          nativeLabelTuple(['ams_temp_alarm', 'native.cea2e492f99c501b']),
        ]}
        values={values ?? {}}
        onChange={(key, value) => setValues(old => ({ ...old, [key]: value }))}
      />
      <PrimaryButton
        label={translateNative('native.f39d8d030a248c61')}
        disabled={!values}
        loading={save.isPending}
        onPress={() => save.mutate()}
      />
    </>
  );
}
export function SpoolmanPolicySettings() {
  useNativeLocale();
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
          ? translateNative('native.2326ab2b176807c6')
          : translateNative('native.9b7191420530dcc0'),
        'success',
      );
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const setBool = (key: string, value: boolean) =>
    setForm(old => ({ ...old, [key]: value ? 'true' : 'false' }));
  return (
    <>
      <InventoryText>{translateNative('native.a497eb1484a0cd47')}</InventoryText>
      {settings.isError && (
        <InventoryText>{settings.error.message}</InventoryText>
      )}
      <Toggle
        label={translateNative('common.enabled')}
        value={form?.spoolman_enabled === 'true'}
        onChange={value => setBool('spoolman_enabled', value)}
      />
      <Fields
        fields={[nativeLabelTuple(['spoolman_url', 'native.71333a0573cd11e3'])]}
        values={{ spoolman_url: text(form, 'spoolman_url') }}
        onChange={(key, value) => setForm(old => ({ ...old, [key]: value }))}
      />
      <ChoiceField
        label={translateNative('native.6188b0f89beb97d1')}
        value={text(form, 'spoolman_sync_mode', 'auto')}
        options={['auto', 'manual'].map(value => ({ value, label: value }))}
        onChange={value =>
          setForm(old => ({ ...old, spoolman_sync_mode: value }))
        }
      />
      <Toggle
        label={translateNative('native.c70777700b9c308b')}
        value={form?.spoolman_disable_weight_sync === 'true'}
        onChange={value => setBool('spoolman_disable_weight_sync', value)}
      />
      <Toggle
        label={translateNative('native.0bbebfbca4687664')}
        value={form?.spoolman_report_partial_usage !== 'false'}
        onChange={value => setBool('spoolman_report_partial_usage', value)}
      />
      <Toggle
        label={translateNative('native.27e43372c35abfd3')}
        value={form?.auto_add_unknown_rfid !== 'false'}
        onChange={value => setBool('auto_add_unknown_rfid', value)}
      />
      <PrimaryButton
        label={translateNative('native.8c3c41234db9c7ea')}
        loading={mutation.isPending}
        disabled={!form}
        onPress={() => mutation.mutate('save')}
      />
      <ChoiceField
        label={translateNative('native.f25feceac26fe43c')}
        value={scope}
        options={[
          { value: 'all', get label() { return translateNative('native.b8ed6cb4c204100e'); } },
          ...(printers.data ?? []).map(row => ({
            value: text(row, 'id'),
            label: text(row, 'name'),
          })),
        ]}
        onChange={setScope}
      />
      <PrimaryButton
        label={translateNative('native.3ffa9e3e11966cf4')}
        onPress={() => setConfirm('sync')}
      />
      <PrimaryButton
        label={translateNative('native.19846f90b5631991')}
        variant="secondary"
        onPress={() => setConfirm('internal')}
      />
      <PrimaryButton
        label={translateNative('native.a0bcac60919e9e10')}
        variant="secondary"
        onPress={() => setConfirm('spoolman')}
      />
      {result && (
        <InventoryText>{JSON.stringify(result, null, 2)}</InventoryText>
      )}
      <ConfirmModal
        visible={confirm !== null}
        title={translateNative('native.fca36c79b68d69b6')}
        message={
          confirm === 'sync'
            ? translateNative('native.7ce0c504b4c4142b')
            : translateNative('native.35cdcef90fb8d8ba')
        }
        onClose={() => setConfirm(null)}
        onConfirm={() => mutation.mutate(confirm ?? 'sync')}
        loading={mutation.isPending}
      />
    </>
  );
}
import { useServerSettingsKey } from '@/hooks/useServerSettingsKey';
