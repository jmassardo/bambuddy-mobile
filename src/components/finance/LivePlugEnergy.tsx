import { useNativeLocale, useTranslation } from '@/i18n';
import React from 'react';
import { Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { profilesApi } from '@/api/profiles';
import { SectionCard } from '@/components/common/AppUI';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/theme';

import type { SmartPlug, SmartPlugStatus } from '@/types/api';

export function aggregatePlugEnergy(
  rows: Array<{
    plug: Pick<SmartPlug, 'plug_type'>;
    status: SmartPlugStatus | null;
  }>,
) {
  const result = {
    reachable: 0,
    power: null as number | null,
    today: null as number | null,
    yesterday: null as number | null,
    total: null as number | null,
  };
  for (const { plug, status } of rows) {
    if (
      !status ||
      !(
        status.reachable ||
        (plug.plug_type === 'mqtt' && status.energy?.power != null)
      )
    )
      continue;
    result.reachable += 1;
    for (const key of ['power', 'today', 'yesterday', 'total'] as const) {
      const value = status.energy?.[key];
      if (value != null && Number.isFinite(value))
        result[key] = (result[key] ?? 0) + value;
    }
  }
  return result;
}

export function LivePlugEnergy() {
  useNativeLocale();
  const { hasPermission } = useAuth();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const allowed = hasPermission('smart_plugs:read');
  const label = (value: string) =>
    t(`energy.${value}`, { defaultValue: value });
  const query = useQuery({
    queryKey: ['smartPlugs', 'liveEnergy'],
    queryFn: async () => {
      const plugs = (await profilesApi.getSmartPlugs()).filter(p => p.enabled);
      const rows = await Promise.all(
        plugs.map(async plug => ({
          plug,
          status: await profilesApi
            .getSmartPlugStatus(plug.id)
            .catch(() => null),
        })),
      );
      return { rows, ...aggregatePlugEnergy(rows) };
    },
    enabled: allowed,
    refetchInterval: 10000,
  });
  if (!allowed) return null;
  const measured = (value: number | null | undefined, unit: string) =>
    value == null ? label('Unavailable') : `${value.toFixed(2)} ${unit}`;
  return (
    <SectionCard
      title={label('Live smart-plug energy')}
      subtitle={label(
        'Real measurements from enabled plugs, refreshed every 10 seconds. Not archived-print estimates.',
      )}
    >
      {query.isError && (
        <Text accessibilityRole="alert" style={{ color: colors.error }}>
          {query.error.message}
        </Text>
      )}
      {query.isPending && (
        <Text style={{ color: colors.text }}>{label('Loading…')}</Text>
      )}
      {query.data && (
        <>
          <Text style={{ color: colors.text }}>
            {label('Reachable plugs')}: {query.data.reachable} /{' '}
            {query.data.rows.length}
          </Text>
          <Text style={{ color: colors.text }}>
            {label('Live total power')}: {measured(query.data.power, 'W')}
          </Text>
          <Text style={{ color: colors.text }}>
            {label('Today')}: {measured(query.data.today, 'kWh')}
          </Text>
          <Text style={{ color: colors.text }}>
            {label('Yesterday')}: {measured(query.data.yesterday, 'kWh')}
          </Text>
          <Text style={{ color: colors.text }}>
            {label('Lifetime')}: {measured(query.data.total, 'kWh')}
          </Text>
          {query.data.rows.map(({ plug, status }) => {
            const reachable =
              status?.reachable ||
              (plug.plug_type === 'mqtt' && status?.energy?.power != null);
            const energy = reachable ? status?.energy : null;
            return (
              <Text key={plug.id} style={{ color: colors.text }}>
                {plug.name}: {measured(energy?.power, 'W')} · {label('Today')}:{' '}
                {measured(energy?.today, 'kWh')} · {label('Yesterday')}:{' '}
                {measured(energy?.yesterday, 'kWh')} · {label('Lifetime')}:{' '}
                {measured(energy?.total, 'kWh')}
              </Text>
            );
          })}
        </>
      )}
    </SectionCard>
  );
}
