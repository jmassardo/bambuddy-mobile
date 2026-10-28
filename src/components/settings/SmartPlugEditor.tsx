import { nativeLabelTuple, nativeMessage, translateNative, useNativeLocale, useNativeMessageState } from '@/i18n';

import React, { useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { integrationsApi } from '@/api/integrations';
import { PrimaryButton, TextField } from '@/components/common/AppUI';
import type { SmartPlug } from '@/types/api';
import { useTheme } from '@/theme';
import { OptionChipsField, settingsStyles, SimpleModal, SwitchRow } from './shared';
import { buildPlugPayload, makePlugDraft, mqttFields, plugSwitches, policyFields, restFields, tasmotaFields } from './smartPlugForm';
import { useIntegrationTranslation } from './useIntegrationTranslation';

export function SmartPlugEditor({ plug, existingPlugs, canControl, onClose }: {
  plug?: SmartPlug; existingPlugs: SmartPlug[]; canControl: boolean; onClose: () => void;
}) {
  useNativeLocale();
  const { colors } = useTheme();
  const tr = useIntegrationTranslation();
  const client = useQueryClient();
  const [draft, setDraft] = useState(() => makePlugDraft(plug));
  const [search, setSearch] = useState('');
  const [sensorSearch, setSensorSearch] = useState('');
  const [message, setMessage] = useNativeMessageState('');
  const [scanActive, setScanActive] = useState(false);
  const type = String(draft.plug_type);
  const set = (key: string, value: string | boolean) => { setDraft(current => ({ ...current, [key]: value })); setMessage(''); };
  const printers = useQuery({ queryKey: ['printers'], queryFn: () => api.getPrinters() });
  const entities = useQuery({ queryKey: ['haPlugEntities', search], queryFn: () => integrationsApi.haEntities(search), enabled: type === 'homeassistant' });
  const sensors = useQuery({ queryKey: ['haPlugSensors'], queryFn: integrationsApi.haSensors, enabled: type === 'homeassistant' });
  const scan = useQuery({
    queryKey: ['tasmotaScan'], queryFn: integrationsApi.scanStatus, enabled: type === 'tasmota',
    refetchInterval: scanActive ? 1000 : false,
  });
  const devices = useQuery({
    queryKey: ['tasmotaDevices', scan.data?.scanned], queryFn: integrationsApi.discoveredDevices, enabled: type === 'tasmota',
    refetchInterval: scanActive ? 1000 : false,
  });
  useEffect(() => {
    if (scan.data?.running) setScanActive(true);
    else if (scan.data && scan.data.total > 0) setScanActive(false);
  }, [scan.data]);
  const discovery = useMutation({
    mutationFn: (start: boolean) => start ? integrationsApi.startScan() : integrationsApi.stopScan(),
    onSuccess: (_, start) => { setScanActive(start); void client.invalidateQueries({ queryKey: ['tasmotaScan'] }); void devices.refetch(); },
    onError: (error: Error) => setMessage(error.message),
  });
  const save = useMutation({
    mutationFn: () => integrationsApi.savePlug(buildPlugPayload(draft), plug?.id),
    onSuccess: async () => {
      await Promise.all(['smartPlugs', 'smartPlugByPrinter', 'smartPlugStatus', 'scriptPlugsByPrinter'].map(key => client.invalidateQueries({ queryKey: [key] })));
      onClose();
    },
    onError: (error: Error) => setMessage(error.message),
  });
  const test = useMutation({
    mutationFn: async () => {
      if (type === 'tasmota') return integrationsApi.testTasmota(String(draft.ip_address), String(draft.username) || null, String(draft.password) || null);
      if (type === 'rest') {
        const payload = buildPlugPayload(draft);
        return integrationsApi.testREST(payload.rest_status_url || payload.rest_on_url || payload.rest_off_url || '', payload.rest_method || 'GET', payload.rest_headers || null);
      }
      throw new Error(translateNative('native.18e5dd2499bc7016'));
    },
    onSuccess: result => setMessage(result.success ? nativeMessage('native.2225f2f3a2f1fb50') : ('error' in result && result.error) || nativeMessage('native.df9a9d2cedce22b6')),
    onError: (error: Error) => setMessage(error.message),
  });
  const error = entities.error || sensors.error || scan.error || devices.error;
  const sensorKeys = [
    nativeLabelTuple(['ha_power_entity', 'native.48a3eb3b463d6f13', ['W', 'kW']]),
    nativeLabelTuple(['ha_energy_today_entity', 'native.419d43d8436bfbf7', ['Wh', 'kWh']]),
    nativeLabelTuple(['ha_energy_total_entity', 'native.9ee91d8e38226e1b', ['Wh', 'kWh']]),
  ] as const;
  const visibleFields = [
    ...(type === 'tasmota' ? tasmotaFields : type === 'mqtt' ? mqttFields : type === 'rest' ? restFields : []),
    ...policyFields.filter(field => {
      if (field.key === 'off_delay_minutes') return draft.auto_off && draft.off_delay_mode === 'time';
      if (field.key === 'off_temp_threshold') return draft.auto_off && draft.off_delay_mode === 'temperature';
      if (field.key === 'off_delay_after_drying_minutes') return draft.auto_off_after_drying;
      if (field.key.startsWith('power_alert_')) return draft.power_alert_enabled;
      return draft.schedule_enabled;
    }),
  ];
  return (
    <SimpleModal visible title={plug ? `${tr('Edit smart plug')}: ${plug.name}` : tr('Add smart plug')} onClose={onClose}>
      <ScrollView contentContainerStyle={settingsStyles.modalBody} keyboardShouldPersistTaps="handled">
        <TextField label={tr('Name')} value={String(draft.name)} onChangeText={value => set('name', value)} />
        <OptionChipsField label={tr('Integration')} value={type} disabled={!!plug} options={['tasmota', 'homeassistant', 'mqtt', 'rest'].map(key => ({ key, label: key }))} onChange={value => {
          set('plug_type', value);
          if (value === 'homeassistant') { set('auto_on', false); set('auto_off', false); }
        }} />
        {type === 'tasmota' ? <>
          <PrimaryButton label={tr('Discover Tasmota plugs')} variant="secondary" disabled={discovery.isPending} onPress={() => discovery.mutate(true)} />
          <PrimaryButton label={tr('Stop discovery')} variant="secondary" disabled={discovery.isPending || (!scanActive && !scan.data?.running)} onPress={() => discovery.mutate(false)} />
          <Text style={{ color: colors.textSecondary }}>{tr(scan.data?.running ? 'Scanning' : 'Scan stopped')} • {scan.data?.scanned ?? 0}/{scan.data?.total ?? 0}</Text>
          {(devices.data ?? []).map(device => <PrimaryButton key={device.ip_address} label={`${device.name} (${device.ip_address})`} variant="secondary" onPress={() => { set('ip_address', device.ip_address); if (!draft.name) set('name', device.name); }} />)}
        </> : null}
        {type === 'homeassistant' ? <>
          <TextField label={tr('Search Home Assistant entities')} value={search} onChangeText={setSearch} autoCapitalize="none" />
          {entities.isFetching ? <Text style={{ color: colors.textSecondary }}>{tr('Loading entities…')}</Text> : null}
          <OptionChipsField label={`${tr('Switch or script')}: ${draft.ha_entity_id || tr('not selected')}`} value={String(draft.ha_entity_id)} options={(entities.data ?? []).filter(entity =>
            ['switch', 'light', 'input_boolean', 'script'].includes(entity.domain) &&
            !existingPlugs.some(item => item.id !== plug?.id && item.ha_entity_id === entity.entity_id)
          ).map(entity => ({ key: entity.entity_id, label: `${entity.friendly_name} (${entity.entity_id})` }))} onChange={value => set('ha_entity_id', value)} />
          <TextField label={tr('Search power and energy sensors')} value={sensorSearch} onChangeText={setSensorSearch} />
          {sensorKeys.map(([key, label, units]) => <OptionChipsField key={key} label={`${tr(label)}: ${draft[key] || tr('None')}`} value={String(draft[key])} options={[
            { key: '', label: tr('None') },
            ...(sensors.data ?? []).filter(sensor =>
              (units as readonly string[]).includes(sensor.unit_of_measurement || '') &&
              `${sensor.friendly_name} ${sensor.entity_id}`.toLowerCase().includes(sensorSearch.toLowerCase()) &&
              !sensorKeys.some(([other]) => other !== key && draft[other] === sensor.entity_id)
            ).map(sensor => ({ key: sensor.entity_id, label: `${sensor.friendly_name} (${sensor.entity_id}, ${sensor.unit_of_measurement})` })),
          ]} onChange={value => set(key, value)} />)}
        </> : null}
        {type === 'rest' ? <OptionChipsField label={tr('HTTP method')} value={String(draft.rest_method)} options={['GET', 'POST', 'PUT', 'PATCH'].map(key => ({ key, label: key }))} onChange={value => set('rest_method', value)} /> : null}
        {visibleFields.map(field => <TextField key={field.key} label={tr(field.label)} value={String(draft[field.key] ?? '')} onChangeText={value => set(field.key, value)} autoCapitalize="none" keyboardType={field.min != null ? 'decimal-pad' : 'default'} secureTextEntry={field.key === 'password'} multiline={field.key.endsWith('_body') || field.key === 'rest_headers'} />)}
        {type === 'mqtt' ? <Text style={{ color: colors.textSecondary }}>{tr('MQTT plugs are monitor-only. Leave JSON paths empty for raw numeric payloads; multipliers convert to W / kWh.')}</Text> : null}
        {type === 'tasmota' || type === 'rest' ? <>
          {type === 'rest' ? <Text style={{ color: colors.textSecondary }}>{tr('Test sends the selected method and headers to the status URL (or ON/OFF URL). The server test does not send request bodies or validate extraction mappings; ON/OFF tests may change device power.')}</Text> : null}
          <PrimaryButton label={tr('Test unsaved connection')} variant="secondary" loading={test.isPending} disabled={!canControl || test.isPending} onPress={() => test.mutate()} />
        </> : null}
        <OptionChipsField label={tr('Associated printer')} value={String(draft.printer_id)} options={[
          { key: '', label: tr('No printer') },
          ...(printers.data ?? []).filter(printer => type !== 'tasmota' || !existingPlugs.some(item => item.id !== plug?.id && item.plug_type === 'tasmota' && item.printer_id === printer.id)).map(printer => ({ key: String(printer.id), label: printer.name })),
        ]} onChange={value => set('printer_id', value)} />
        {plugSwitches.map(([key, label]) => <SwitchRow key={key} label={tr(label)} description={!plug && type === 'homeassistant' && (key === 'auto_on' || key === 'auto_off') ? tr('Save this entity first, then edit its automatic power policy.') : undefined} disabled={!plug && type === 'homeassistant' && (key === 'auto_on' || key === 'auto_off')} value={Boolean(draft[key])} onValueChange={value => set(key, value)} />)}
        {draft.auto_off ? <OptionChipsField label={tr('Auto-off condition')} value={String(draft.off_delay_mode)} options={[{ key: 'time', label: tr('Delay') }, { key: 'temperature', label: tr('Cooldown temperature') }]} onChange={value => set('off_delay_mode', value)} /> : null}
        {message || error ? <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>{message || error?.message || ''}</Text> : null}
        {error ? <PrimaryButton label={tr('Retry discovery')} variant="secondary" onPress={() => { if (type === 'homeassistant') { void entities.refetch(); void sensors.refetch(); } else { void devices.refetch(); void scan.refetch(); } }} /> : null}
        <PrimaryButton label={tr('Save smart plug')} disabled={save.isPending} loading={save.isPending} onPress={() => save.mutate()} />
      </ScrollView>
    </SimpleModal>
  );
}
