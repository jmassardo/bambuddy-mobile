import { nativeMessage, translateNative, useNativeLocale, useNativeMessageState, useTranslation } from '@/i18n';

import React, { useState } from 'react';
import { Alert, ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { printerControlsApi as device } from '@/api/printerControls';
import { PrimaryButton, SectionCard, TextField } from '@/components/common/AppUI';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';

import { backupGroups, controlPresets, requireInteger } from './deviceControlUtils';
import { AmsUnitControls } from './AmsUnitControls';
import { PrinterSDBrowser } from './PrinterSDBrowser';
import { HeaterTelemetryDetails } from './HeaterTelemetryDetails';
import { SkipObjectsModal } from './SkipObjectsModal';

export function NumericDeviceControl({ label, current, max, disabled, submit, presets }: {
  label: string; current?: number | null; max: number; disabled: boolean;
  submit: (value: number) => Promise<unknown>;
  presets?: number[];
}) {
  useNativeLocale();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [value, setValue] = useState('');
  const [validation, setValidation] = useNativeMessageState('');
  const mutation = useMutation({ mutationFn: submit });
  const send = (target: string) => {
    try {
      const parsed = requireInteger(target, 0, max);
      setValidation('');
      mutation.mutate(parsed);
    } catch {
      setValidation(nativeMessage('device.invalidRange', () => ({ defaultValue: 'Enter a whole number between 0 and {{max}}.', max })));
    }
  };
  return <View style={styles.control}>
    <TextField label={`${label} · ${current ?? '—'}`} value={value}
      onChangeText={setValue} keyboardType="number-pad" placeholder={`0–${max}`} />
    <View style={styles.row}>
      <PrimaryButton label={t('common.apply', { defaultValue: 'Apply' })} onPress={() => send(value)} disabled={disabled} loading={mutation.isPending} />
      <PrimaryButton label={t('device.off', { defaultValue: 'Off' })} variant="secondary" onPress={() => send('0')} disabled={disabled || mutation.isPending} />
    </View>
    <View style={styles.row}>{(presets ?? [])
      .map((preset, index) => <PrimaryButton key={`${preset}-${index}`} label={String(preset)} variant="secondary"
        disabled={disabled || mutation.isPending} onPress={() => send(String(preset))} />)}</View>
    {validation || mutation.error ? <Text style={{ color: colors.error }}>{validation || mutation.error?.message}</Text> : null}
    {mutation.isSuccess ? <Text style={{ color: colors.success }}>{t('device.sent', { defaultValue: 'Command sent; waiting for live device status.' })}</Text> : null}
  </View>;
}

export function PrinterDeviceControls({ printerId, model }: { printerId: number; model?: string | null }) {
  useNativeLocale();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [showFiles, setShowFiles] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const statusQuery = useQuery({
    queryKey: ['printerStatus', printerId], queryFn: () => api.getPrinterStatus(printerId),
    refetchInterval: 5000,
  });
  const labels = useQuery({ queryKey: ['amsLabels', printerId], queryFn: () => device.labels(printerId) });
  const settings = useQuery({ queryKey: [...useServerSettingsKey(), 'ui-preferences'], queryFn: () => device.presets() });
  const nozzlePresets = controlPresets(settings.data?.nozzle_temp_presets, [120, 220, 260], 320);
  const bedPresets = controlPresets(settings.data?.bed_temp_presets, [55, 75, 90], 140);
  const chamberPresets = controlPresets(settings.data?.chamber_temp_presets, [35, 45, 60], 65);
  const fanPresets = controlPresets(settings.data?.fan_speed_presets, [50, 75, 100], 100);
  const status = statusQuery.data;
  const control = hasPermission('printers:control') && status?.connected === true;
  const mutation = useMutation({
    mutationFn: (command: () => Promise<unknown>) => command(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['printerStatus', printerId] }),
  });
  const send = (command: () => Promise<unknown>) => mutation.mutate(command);
  const dual = status?.temperatures?.nozzle_2 != null;
  const idle = !['RUNNING', 'PAUSE', 'PREPARE'].includes(status?.state ?? '');
  const exhausted = model === 'P2S' || model === 'X2D';
  const chamberModels = new Set(['X1C', 'X1', 'X1E', 'X2D', 'P1S', 'P2S', 'H2D', 'H2D Pro', 'H2C', 'H2S']);
  const ductModels = new Set(['P2S', 'X2D', 'H2D', 'H2D Pro', 'H2C', 'H2S']);
  const groups = status ? backupGroups(status) : [];
  return <>
    <SectionCard title={t('device.controls', { defaultValue: 'Hardware controls' })}>
      {statusQuery.isLoading ? <ActivityIndicator /> : null}
      {statusQuery.error ? <Text style={{ color: colors.error }}>{statusQuery.error.message}</Text> : null}
      {!control ? <Text style={{ color: colors.textSecondary }}>{t('device.controlUnavailable', { defaultValue: 'Live connection and printer control permission required.' })}</Text> : null}
      <NumericDeviceControl label={t('device.nozzle', { defaultValue: dual ? translateNative('native.79a4ca178814dc43') : translateNative('native.7754834c4b93316b') })}
        current={status?.temperatures?.nozzle_target} max={320} disabled={!control} presets={nozzlePresets}
        submit={target => device.heater(printerId, 'nozzle', target, dual ? 1 : status?.active_extruder ?? 0)} />
      {dual ? <NumericDeviceControl label={t('device.rightNozzle', { defaultValue: 'Right nozzle target °C' })}
        current={status?.temperatures?.nozzle_2_target} max={320} disabled={!control} presets={nozzlePresets}
        submit={target => device.heater(printerId, 'nozzle', target, 0)} /> : null}
      <NumericDeviceControl label={t('device.bed', { defaultValue: 'Bed target °C' })} current={status?.temperatures?.bed_target}
        max={140} disabled={!control} presets={bedPresets} submit={target => device.heater(printerId, 'bed', target)} />
      {status?.supports_chamber_heater === true ? <NumericDeviceControl label={t('device.chamber', { defaultValue: 'Chamber target °C' })}
        current={status.temperatures?.chamber_target} max={65} disabled={!control} presets={chamberPresets}
        submit={target => device.heater(printerId, 'chamber', target)} /> : null}
      {([
        ['part', t('device.partFan', { defaultValue: 'Part cooling %' }), status?.cooling_fan_speed],
        ['aux', t('device.auxFan', { defaultValue: 'Auxiliary fan %' }), status?.big_fan1_speed],
        ['aux2', t('device.leftAuxFan', { defaultValue: 'Left auxiliary fan %' }), status?.left_aux_fan_speed],
        ['chamber', exhausted ? t('device.exhaustFan', { defaultValue: 'Exhaust fan %' }) : t('device.chamberFan', { defaultValue: 'Chamber fan %' }),
          chamberModels.has(model ?? '') && (!exhausted || status?.exhaust_fan_present) ? status?.big_fan2_speed : null],
      ] as const).map(([fan, label, speed]) => speed != null ? <NumericDeviceControl key={fan} label={label} current={speed}
        max={100} disabled={!control} presets={fanPresets} submit={value => device.fan(printerId, fan, value)} /> : null)}
      {dual ? <View style={styles.row}>{([0, 1] as const).map(extruder =>
        <PrimaryButton key={extruder} label={`${extruder === 1 ? t('device.left', { defaultValue: 'Left' }) : t('device.right', { defaultValue: 'Right' })}${status?.active_extruder === extruder ? ' ✓' : ''}`}
          disabled={!control || !idle || mutation.isPending || status?.active_extruder === extruder}
          onPress={() => send(() => device.extruder(printerId, extruder))} />)}</View> : null}
      {ductModels.has(model ?? '') ? <View style={styles.row}>{(['cooling', 'heating'] as const).map(mode =>
        <PrimaryButton key={mode} label={`${t(`device.${mode}`, { defaultValue: mode === 'cooling' ? translateNative('native.77fef65207e37fea') : translateNative('native.4f0a1d39e8cb763a') })}${status?.airduct_mode === (mode === 'cooling' ? 0 : 1) ? ' ✓' : ''}`}
          disabled={!control || mutation.isPending} onPress={() => send(() => device.airduct(printerId, mode))} />)}</View> : null}
      {mutation.error ? <Text style={{ color: colors.error }}>{mutation.error.message}</Text> : null}
      {mutation.isSuccess ? <Text style={{ color: colors.success }}>{t('device.sent', { defaultValue: 'Command sent; waiting for live device status.' })}</Text> : null}
    </SectionCard>
    <HeaterTelemetryDetails printerId={printerId} status={status} />
    {!idle ? <SectionCard title={t('device.skipObjectsTitle', { defaultValue: 'Skip objects' })}>
      <PrimaryButton label={t('device.skipObjectsTitle', { defaultValue: 'Skip objects' })} disabled={!control}
        onPress={() => setShowSkip(true)} />
    </SectionCard> : null}
    <SkipObjectsModal visible={showSkip} printerId={printerId} onClose={() => setShowSkip(false)} />
    {(status?.ams?.length ?? 0) > 0 ? <SectionCard title={t('device.backup', { defaultValue: 'AMS filament backup' })}>
      <Text style={{ color: colors.text }}>{status?.ams_filament_backup == null ? t('device.unknown', { defaultValue: 'Unknown / unsupported' })
        : status.ams_filament_backup ? t('device.enabled', { defaultValue: 'Enabled' }) : t('device.disabled', { defaultValue: 'Disabled' })}</Text>
      <PrimaryButton label={t('device.toggleBackup', { defaultValue: 'Change filament backup' })}
        disabled={!control || status?.ams_filament_backup == null || mutation.isPending}
        onPress={() => Alert.alert(t('device.backup', { defaultValue: 'AMS filament backup' }),
          t('device.confirmBackup', { defaultValue: 'Change automatic backup spool switching?' }), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.confirm', { defaultValue: 'Confirm' }), onPress: () => send(() => api.setAmsFilamentBackup(printerId, !status?.ams_filament_backup)) },
          ])} />
      <Text style={{ color: colors.textSecondary }}>{t('device.backupGroups', { defaultValue: 'Compatible rotation groups (same profile, color and feed path):' })}</Text>
      {groups.map((group, index) => <Text key={index} style={{ color: colors.text }}>{group.name}: {group.slots.join(' → ')}</Text>)}
    </SectionCard> : null}
    {status?.ams?.map(ams => <AmsUnitControls key={ams.id} printerId={printerId} ams={ams}
      status={status} name={labels.data?.[String(ams.id)]} />)}
    <PrinterHAControls printerId={printerId} />
    {hasPermission('printers:files') ? <SectionCard title={t('device.sd', { defaultValue: 'Printer SD card' })}>
      <PrimaryButton label={t('device.browseSD', { defaultValue: 'Browse physical printer files' })} onPress={() => setShowFiles(true)} />
    </SectionCard> : null}
    <PrinterSDBrowser visible={showFiles} printerId={printerId} onClose={() => setShowFiles(false)} />
  </>;
}

export function PrinterHAControls({ printerId }: { printerId: number }) {
  useNativeLocale();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { hasPermission } = useAuth();
  const enabled = hasPermission('smart_plugs:read');
  const readings = useQuery({ queryKey: ['printerHAReadings', printerId], queryFn: () => device.haReadings(printerId), enabled, refetchInterval: 15000 });
  const plugs = useQuery({ queryKey: ['printerHAActions', printerId], queryFn: () => device.haActions(printerId), enabled });
  const mutation = useMutation({ mutationFn: ({ id, script }: { id: number; script: boolean }) => api.controlSmartPlug(id, script ? 'on' : 'toggle') });
  if (!enabled) return null;
  const actions = plugs.data ?? [];
  return <SectionCard title={t('device.ha', { defaultValue: 'Home Assistant' })}>
    {readings.isLoading ? <ActivityIndicator /> : null}
    {readings.error || plugs.error ? <Text style={{ color: colors.error }}>{readings.error?.message || plugs.error?.message}</Text> : null}
    {readings.data?.map(sensor => <Text key={sensor.id} style={{ color: sensor.alerting ? colors.warning : colors.text }}>
      {sensor.name}: {sensor.reachable ? `${sensor.value ?? sensor.state ?? '—'} ${sensor.unit ?? ''}` : t('device.unreachable', { defaultValue: 'Unreachable' })}
    </Text>)}
    {actions.map(action => {
      const script = action.ha_entity_id?.startsWith('script.') === true;
      return <PrimaryButton key={action.id} label={`${script ? t('device.run', { defaultValue: 'Run' }) : t('device.toggle', { defaultValue: 'Toggle' })} ${action.name}`}
        disabled={!hasPermission('smart_plugs:control')} loading={mutation.isPending}
        onPress={() => script ? mutation.mutate({ id: action.id, script }) : Alert.alert(action.name,
          t('device.confirmHA', { defaultValue: 'Toggle {{entity}}?', entity: action.ha_entity_id ?? action.name }),
          [{ text: t('common.cancel'), style: 'cancel' }, { text: t('common.confirm', { defaultValue: 'Confirm' }), onPress: () => mutation.mutate({ id: action.id, script }) }])} />;
    })}
    {mutation.error ? <Text style={{ color: colors.error }}>{mutation.error.message}</Text> : null}
    {mutation.isSuccess ? <Text style={{ color: colors.success }}>{t('device.actionComplete', { defaultValue: 'Home Assistant action completed.' })}</Text> : null}
    {!readings.isLoading && readings.data?.length === 0 && actions.length === 0 ? <Text style={{ color: colors.textSecondary }}>{t('device.noHA', { defaultValue: 'No printer-bound readings or actions configured.' })}</Text> : null}
  </SectionCard>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  control: { gap: spacing.sm, paddingVertical: spacing.sm },
});
import { useServerSettingsKey } from '@/hooks/useServerSettingsKey';
