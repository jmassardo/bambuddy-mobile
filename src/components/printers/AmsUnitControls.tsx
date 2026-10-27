import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { printerControlsApi as device } from '@/api/printerControls';
import { PrimaryButton, SectionCard, TextField } from '@/components/common/AppUI';
import { MultiSeriesLineChart } from '@/components/common/Charts';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import type { AMSUnit, PrinterStatus } from '@/types/api';
import { dryingCapabilities, dryingReasonText, requireInteger } from './deviceControlUtils';

export function AmsUnitControls({ printerId, ams, status, name }: {
  printerId: number; ams: AMSUnit; status: PrinterStatus; name?: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { hasPermission } = useAuth();
  const client = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [label, setLabel] = useState(name ?? '');
  const [hours, setHours] = useState(24);
  const [sensor, setSensor] = useState<'humidity' | 'temperature'>('humidity');
  const [temp, setTemp] = useState('');
  const [duration, setDuration] = useState('');
  const [filament, setFilament] = useState('');
  const [rotate, setRotate] = useState(false);
  const [delay, setDelay] = useState('');
  const [startAt, setStartAt] = useState('');
  const [validation, setValidation] = useState('');
  useEffect(() => setLabel(name ?? ''), [name]);
  const capabilities = dryingCapabilities(status, ams);
  const rotationAllowed = capabilities.canRotate && !ams.tray.some(tray => tray.state === 11);
  const control = hasPermission('printers:control');
  const history = useQuery({
    queryKey: ['amsHistory', printerId, ams.id, hours],
    queryFn: () => device.history(printerId, ams.id, hours),
    enabled: expanded && hasPermission('ams_history:read'),
  });
  const runs = useQuery({
    queryKey: ['scheduledDryings', printerId],
    queryFn: () => device.scheduled(printerId), refetchInterval: 15000,
  });
  const mutation = useMutation({
    mutationFn: (command: () => Promise<unknown>) => command(),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['printerStatus', printerId] }),
        client.invalidateQueries({ queryKey: ['amsLabels', printerId] }),
        client.invalidateQueries({ queryKey: ['scheduledDryings', printerId] }),
      ]);
    },
  });
  const send = (command: () => Promise<unknown>) => { setValidation(''); mutation.mutate(command); };
  const title = name || `${ams.is_ams_ht ? 'AMS HT' : 'AMS'} ${ams.id >= 128 ? ams.id - 127 : String.fromCharCode(65 + ams.id)}`;
  const start = (scheduled: boolean) => {
    try {
      const target = requireInteger(temp, 45, capabilities.maxTemperature ?? 45);
      const time = requireInteger(duration, 1, 24);
      let startAfter: string | null = null;
      if (scheduled && startAt.trim()) {
        const date = new Date(startAt);
        if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
          throw new Error(t('device.futureDate', { defaultValue: 'Enter a future date and time with timezone, for example 2026-12-01T22:00:00-05:00.' }));
        }
        startAfter = date.toISOString();
      } else if (scheduled && delay.trim()) {
        const minutes = Number(delay);
        if (!Number.isFinite(minutes) || minutes <= 0) throw new Error(t('device.positiveDelay', { defaultValue: 'Delay must be a positive number of minutes.' }));
        startAfter = new Date(Date.now() + minutes * 60000).toISOString();
      }
      if (filament.length > 50) throw new Error(t('device.filamentLength', { defaultValue: 'Filament description must be at most 50 characters.' }));
      const run = () => scheduled ? device.schedule({
        printer_id: printerId, ams_id: ams.id, temp: target, duration_hours: time,
        filament, rotate_tray: rotationAllowed && rotate, start_after: startAfter,
      }) : api.startDrying(printerId, ams.id, target, time, filament, rotationAllowed && rotate);
      Alert.alert(title, t('device.confirmDrying', { defaultValue: '{{temperature}}°C for {{hours}} hours. {{start}}',
        temperature: target, hours: time, start: scheduled ? startAfter ?? t('device.whenAvailable', { defaultValue: 'Start when printer becomes available.' }) : t('device.startNow', { defaultValue: 'Start now.' }) }),
      [{ text: t('common.cancel'), style: 'cancel' }, { text: t('common.confirm', { defaultValue: 'Confirm' }), onPress: () => send(run) }]);
    } catch (error) {
      setValidation(t('device.dryingValidation', { defaultValue: 'Check drying settings: {{reason}}', reason: error instanceof Error ? error.message : String(error) }));
    }
  };
  const blocked = capabilities.blockedReasons.length > 0;
  const running = ams.dry_time > 0;
  const activePrint = ['RUNNING', 'PAUSE', 'PREPARE'].includes(status.state ?? '');
  const cannotStart = !control || !status.connected || !capabilities.supported || capabilities.screenOnly || blocked || running
    || (activePrint && status.supports_drying_while_printing !== true);
  const stats = history.data;
  const min = sensor === 'humidity' ? stats?.min_humidity : stats?.min_temperature;
  const max = sensor === 'humidity' ? stats?.max_humidity : stats?.max_temperature;
  const avg = sensor === 'humidity' ? stats?.avg_humidity : stats?.avg_temperature;
  return <SectionCard title={title}>
    <Text style={{ color: colors.textSecondary }}>{ams.serial_number || '—'} · {ams.sw_ver || '—'} · {ams.module_type || '—'}</Text>
    <PrimaryButton label={t('device.amsDetails', { defaultValue: expanded ? 'Hide AMS details' : 'AMS details, name and history' })}
      variant="secondary" onPress={() => setExpanded(!expanded)} />
    {expanded ? <Modal visible animationType="slide" onRequestClose={() => setExpanded(false)}>
      <ScrollView style={[styles.details, { backgroundColor: colors.background }]} contentContainerStyle={styles.stack}>
      <PrimaryButton label={t('common.close')} variant="secondary" onPress={() => setExpanded(false)} />
      <Text style={{ color: colors.text }}>{title} · {ams.serial_number || '—'} · {ams.sw_ver || '—'}</Text>
      <TextField label={t('device.amsName', { defaultValue: 'Friendly name' })} value={label} onChangeText={setLabel} maxLength={100} />
      <View style={styles.row}>
        <PrimaryButton label={t('common.save')} disabled={!hasPermission('printers:update') || !label.trim()} loading={mutation.isPending}
          onPress={() => send(() => device.label(printerId, ams.id, label.trim(), ams.serial_number))} />
        <PrimaryButton label={t('common.reset', { defaultValue: 'Reset name' })} disabled={!hasPermission('printers:update')} loading={mutation.isPending}
          onPress={() => send(() => device.resetLabel(printerId, ams.id, ams.serial_number))} />
      </View>
      {hasPermission('ams_history:read') ? <>
        <View style={styles.row}>{(['humidity', 'temperature'] as const).map(kind =>
          <PrimaryButton key={kind} label={t(`device.${kind}`, { defaultValue: kind === 'humidity' ? 'Humidity %' : 'Temperature °C' })}
            variant={kind === sensor ? 'primary' : 'secondary'} onPress={() => setSensor(kind)} />)}</View>
        <View style={styles.row}>{[1, 6, 24, 48, 168].map(range => <PrimaryButton key={range} label={`${range}h`}
          variant={range === hours ? 'primary' : 'secondary'} onPress={() => setHours(range)} />)}</View>
        {history.isLoading ? <ActivityIndicator /> : history.error ? <Text style={{ color: colors.error }}>{history.error.message}</Text>
          : !history.data?.data.some(point => point[sensor] != null) ? <Text style={{ color: colors.textSecondary }}>{t('device.noHistory', { defaultValue: 'No sensor samples in this range.' })}</Text>
            : <>
              <Text style={{ color: colors.text }}>{t('device.summary', { defaultValue: 'Min {{min}} · Avg {{avg}} · Max {{max}}', min: min ?? '—', avg: avg ?? '—', max: max ?? '—' })}</Text>
              <MultiSeriesLineChart points={history.data.data.map(point => ({ label: new Date(point.recorded_at).toLocaleString(), values: { value: point[sensor] } }))}
                series={[{ key: 'value', label: sensor === 'humidity' ? t('device.humidity', { defaultValue: 'Humidity %' }) : t('device.temperature', { defaultValue: 'Temperature °C' }), color: colors.accent }]} />
            </>}
      </> : null}
      </ScrollView>
    </Modal> : null}
    {capabilities.supported || capabilities.screenOnly ? <View style={styles.stack}>
      <Text style={{ color: colors.text }}>{t('device.dryingStatus', { defaultValue: 'Drying: {{state}} · {{minutes}} min remaining', state: capabilities.screenOnly ? t('device.screenOnly', { defaultValue: 'Control from printer screen only' })
        : capabilities.stalled ? t('device.stalled', { defaultValue: 'Not running / countdown stalled' }) : running ? t('device.running', { defaultValue: 'Running' }) : t('device.off', { defaultValue: 'Off' }), minutes: ams.dry_time })}</Text>
      {ams.dry_filament || ams.dry_target_temp != null ? <Text style={{ color: colors.textSecondary }}>{ams.dry_filament} · {ams.dry_target_temp ?? '—'}°C</Text> : null}
      {blocked ? <Text style={{ color: colors.warning }}>{t('device.dryingBlocked', { defaultValue: 'Blocked: {{reasons}}', reasons: capabilities.blockedReasons.map(code => t(`device.dryingReason.${code}`, { defaultValue: dryingReasonText(code) })).join(', ') })}</Text> : null}
      {!capabilities.screenOnly ? <>
        <TextField label={t('device.dryingTemperature', { defaultValue: 'Drying temperature (45–{{max}}°C)', max: capabilities.maxTemperature ?? '—' })} value={temp} onChangeText={setTemp} keyboardType="number-pad" />
        <TextField label={t('device.dryingHours', { defaultValue: 'Duration (1–24 hours)' })} value={duration} onChangeText={setDuration} keyboardType="number-pad" />
        <TextField label={t('device.dryingFilament', { defaultValue: 'Filament description (optional)' })} value={filament} onChangeText={setFilament} maxLength={50} />
        {capabilities.canRotate ? <PrimaryButton label={t('device.rotation', { defaultValue: 'Rotate trays: {{state}}', state: !rotationAllowed ? t('device.rotationUnavailable', { defaultValue: 'Unavailable while filament is loaded' }) : rotate ? t('device.enabled', { defaultValue: 'Enabled' }) : t('device.disabled', { defaultValue: 'Disabled' }) })} variant="secondary" disabled={!rotationAllowed} onPress={() => setRotate(!rotate)} /> : null}
        <View style={styles.row}>
          <PrimaryButton label={t('device.startDrying', { defaultValue: 'Start drying' })} disabled={cannotStart} loading={mutation.isPending} onPress={() => start(false)} />
          <PrimaryButton label={t('device.stopDrying', { defaultValue: 'Stop drying' })} variant="danger" disabled={!control || !running || !status.connected} loading={mutation.isPending}
            onPress={() => Alert.alert(title, t('device.confirmStopDrying', { defaultValue: 'Stop this AMS drying cycle?' }), [{ text: t('common.cancel'), style: 'cancel' },
              { text: t('common.confirm', { defaultValue: 'Confirm' }), onPress: () => send(() => api.stopDrying(printerId, ams.id)) }])} />
        </View>
        <TextField label={t('device.delay', { defaultValue: 'Delay (minutes, optional)' })} value={delay} onChangeText={value => { setDelay(value); setStartAt(''); }} keyboardType="decimal-pad" />
        <TextField label={t('device.startAt', { defaultValue: 'Or start at (ISO date/time with timezone)' })} value={startAt} onChangeText={value => { setStartAt(value); setDelay(''); }} autoCapitalize="none" />
        <PrimaryButton label={t('device.scheduleDrying', { defaultValue: 'Schedule drying' })} disabled={!control || !capabilities.supported} loading={mutation.isPending} onPress={() => start(true)} />
      </> : null}
    </View> : null}
    {runs.error ? <Text style={{ color: colors.error }}>{runs.error.message}</Text> : null}
    {runs.data?.filter(run => run.ams_id === ams.id).map(run => <View key={run.id} style={styles.stack}>
      <Text style={{ color: colors.text }}>{run.status} · {run.temp}°C · {run.duration_hours}h · {run.start_after ? new Date(run.start_after).toLocaleString() : t('device.whenAvailable', { defaultValue: 'When available' })}</Text>
      {run.waiting_reason || run.error_message ? <Text style={{ color: colors.warning }}>{run.waiting_reason || run.error_message}</Text> : null}
      <PrimaryButton label={run.status === 'failed' ? t('common.dismiss', { defaultValue: 'Dismiss' }) : t('common.cancel')}
        disabled={!control} loading={mutation.isPending} variant="secondary"
        onPress={() => Alert.alert(title, t('device.cancelSchedule', { defaultValue: 'Cancel or dismiss this scheduled drying run? A running cycle will be stopped.' }), [
          { text: t('common.cancel'), style: 'cancel' }, { text: t('common.confirm', { defaultValue: 'Confirm' }), onPress: () => send(() => device.cancelScheduled(run.id)) },
        ])} />
    </View>)}
    {validation || mutation.error ? <Text style={{ color: colors.error }}>{validation || mutation.error?.message}</Text> : null}
    {mutation.isSuccess ? <Text style={{ color: colors.success }}>{t('device.saved', { defaultValue: 'Saved / command accepted. Live state will refresh.' })}</Text> : null}
  </SectionCard>;
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm, paddingVertical: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  details: { flex: 1, padding: spacing.lg, paddingTop: spacing.xl },
});
