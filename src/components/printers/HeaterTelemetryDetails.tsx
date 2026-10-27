import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { PrimaryButton, SectionCard } from '@/components/common/AppUI';
import { MultiSeriesLineChart } from '@/components/common/Charts';
import { useTranslation } from '@/i18n';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import type { HeaterSensorKind, PrinterStatus } from '@/types/api';

export function HeaterTelemetryDetails({ printerId, status }: { printerId: number; status?: PrinterStatus }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [hours, setHours] = useState(24);
  const [kind, setKind] = useState<HeaterSensorKind>('nozzle');
  const kinds: HeaterSensorKind[] = ['nozzle', 'bed'];
  if (status?.temperatures?.nozzle_2 != null) kinds.push('nozzle_2');
  if (status?.temperatures?.chamber != null) kinds.push('chamber');
  const history = useQuery({
    queryKey: ['printerSensorHistoryDetails', printerId, hours, kind],
    queryFn: () => api.getPrinterSensorHistory(printerId, hours, [kind]),
  });
  const series = history.data?.series.find(item => item.sensor_kind === kind);
  return <SectionCard title={t('device.heaterDetails', { defaultValue: 'Heater sensor details' })}>
    <View style={styles.row}>{kinds.map(sensor => <PrimaryButton key={sensor} label={t(`device.sensor.${sensor}`, { defaultValue: sensor === 'nozzle_2' ? 'Right nozzle' : sensor === 'nozzle' && kinds.includes('nozzle_2') ? 'Left nozzle' : sensor })}
      variant={sensor === kind ? 'primary' : 'secondary'} onPress={() => setKind(sensor)} />)}</View>
    <View style={styles.row}>{[1, 6, 24, 48, 168].map(range => <PrimaryButton key={range} label={`${range}h`}
      variant={range === hours ? 'primary' : 'secondary'} onPress={() => setHours(range)} />)}</View>
    {history.isLoading ? <ActivityIndicator /> : null}
    {history.error ? <Text style={{ color: colors.error }}>{history.error.message}</Text> : null}
    {!history.isLoading && !series?.data.some(point => point.value != null || point.target != null) ? <Text style={{ color: colors.textSecondary }}>{t('device.noHistory', { defaultValue: 'No sensor samples in this range.' })}</Text> : null}
    {series?.data.length ? <>
      <Text style={{ color: colors.text }}>{t('device.summary', { defaultValue: 'Min {{min}} · Avg {{avg}} · Max {{max}}', min: series.min_value ?? '—', avg: series.avg_value ?? '—', max: series.max_value ?? '—' })}</Text>
      <MultiSeriesLineChart points={series.data.map(point => ({ label: new Date(point.recorded_at).toLocaleString(), values: { actual: point.value, target: point.target } }))}
        series={[{ key: 'actual', label: t('device.actual', { defaultValue: 'Actual °C' }), color: colors.accent },
          { key: 'target', label: t('device.target', { defaultValue: 'Target °C' }), color: colors.warning, dashed: true }]} />
    </> : null}
  </SectionCard>;
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm } });
