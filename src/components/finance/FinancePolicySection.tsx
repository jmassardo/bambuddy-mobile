import React, { useEffect, useState } from 'react';
import { Alert, Switch, Text } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '@/api/settings';
import { financeApi } from '@/api/finance';
import { Input, PrimaryButton, SectionCard } from '@/components/common/AppUI';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n';
import { useTheme } from '@/theme';

export function FinancePolicySection({
  energyOnly = false,
}: {
  energyOnly?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { hasPermission, user } = useAuth();
  const cache = useQueryClient();
  const label = (value: string) =>
    t(`financePolicy.${value}`, { defaultValue: value });
  const read = hasPermission('settings:read');
  const update = hasPermission('settings:update');
  const [billing, setBilling] = useState(false);
  const [kill, setKill] = useState(false);
  const [day, setDay] = useState('1');
  const [timezone, setTimezone] = useState('UTC');
  const [tracking, setTracking] = useState<'print' | 'total'>('total');
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.getSettings,
    enabled: read,
  });
  useEffect(() => {
    if (!settings.data) return;
    setBilling(settings.data.billing_enabled === true);
    setKill(settings.data.printer_kill_switch_enabled === true);
    setDay(String(settings.data.finance_budget_reset_day ?? 1));
    setTimezone(String(settings.data.finance_budget_reset_timezone ?? 'UTC'));
    setTracking(
      settings.data.energy_tracking_mode === 'print' ? 'print' : 'total',
    );
  }, [settings.data]);
  const mutation = useMutation({
    mutationFn: async (rebuild: boolean) => {
      if (rebuild) {
        if (!user || !hasPermission('cost_centers:modify'))
          throw new Error(label('Permission denied'));
        return financeApi.rebuild();
      }
      if (!update) throw new Error(label('Permission denied'));
      if (energyOnly)
        return settingsApi.updateSettings({ energy_tracking_mode: tracking });
      if (!/^\d+$/.test(day) || Number(day) < 1 || Number(day) > 31)
        throw new Error(label('Reset day must be 1–31'));
      try {
        new Intl.DateTimeFormat(undefined, { timeZone: timezone }).format();
      } catch {
        throw new Error(label('Enter a valid IANA timezone'));
      }
      return settingsApi.updateSettings({
        billing_enabled: billing,
        printer_kill_switch_enabled: kill,
        finance_budget_reset_day: Number(day),
        finance_budget_reset_timezone: timezone,
      });
    },
    onSuccess: async (_, rebuild) => {
      setError('');
      setResult(
        label(rebuild ? 'Ledger rebuilt successfully' : 'Settings saved'),
      );
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['settings'] }),
        cache.invalidateQueries({ queryKey: ['finance'] }),
        cache.invalidateQueries({ queryKey: ['ui-flags'] }),
      ]);
    },
    onError: (err: Error) => {
      setError(err.message);
      setResult('');
    },
  });
  if (!read && (energyOnly || !user || !hasPermission('cost_centers:modify')))
    return null;
  return (
    <SectionCard
      title={label(
        energyOnly ? 'Energy tracking mode' : 'Finance billing policy',
      )}
    >
      {read && settings.isPending && (
        <Text style={{ color: colors.text }}>{label('Loading…')}</Text>
      )}
      {settings.isError && (
        <Text accessibilityRole="alert" style={{ color: colors.error }}>
          {settings.error.message}
        </Text>
      )}
      {settings.isSuccess &&
        (energyOnly ? (
          <>
            <PrimaryButton
              label={label(`Prints only${tracking === 'print' ? ' ✓' : ''}`)}
              disabled={!update || mutation.isPending}
              onPress={() => setTracking('print')}
            />
            <PrimaryButton
              label={label(
                `Total consumption${tracking === 'total' ? ' ✓' : ''}`,
              )}
              disabled={!update || mutation.isPending}
              onPress={() => setTracking('total')}
            />
            <Text style={{ color: colors.text }}>
              {label(
                tracking === 'print'
                  ? 'Track only energy consumed during prints.'
                  : 'Track all measured energy, including idle and standby consumption.',
              )}
            </Text>
          </>
        ) : (
          <>
            <Text style={{ color: colors.text }}>
              {label('Billing enabled')}
            </Text>
            <Switch
              accessibilityLabel={label('Billing enabled')}
              disabled={!update || mutation.isPending}
              value={billing}
              onValueChange={setBilling}
            />
            <Text style={{ color: colors.text }}>
              {label(
                'Unauthorized print kill switch — immediately stops prints started without authorization.',
              )}
            </Text>
            <Switch
              accessibilityLabel={label('Unauthorized print kill switch')}
              disabled={!update || mutation.isPending}
              value={kill}
              onValueChange={setKill}
            />
            <Input
              label={label('Monthly budget reset day (1–31)')}
              keyboardType="number-pad"
              value={day}
              onChangeText={setDay}
              editable={update && !mutation.isPending}
            />
            <Text style={{ color: colors.text }}>
              {label(
                'Short months use their last day. The budget window starts in the selected timezone.',
              )}
            </Text>
            <Input
              label={label('Reset timezone (IANA, e.g. America/Chicago)')}
              value={timezone}
              onChangeText={setTimezone}
              autoCapitalize="none"
              editable={update && !mutation.isPending}
            />
          </>
        ))}
      {read && update && (
        <PrimaryButton
          label={label(mutation.isPending ? 'Saving…' : 'Save')}
          disabled={!settings.isSuccess || mutation.isPending}
          onPress={() => mutation.mutate(false)}
        />
      )}
      {!energyOnly && user && hasPermission('cost_centers:modify') && (
        <PrimaryButton
          label={label('Rebuild wallet ledger')}
          disabled={mutation.isPending}
          onPress={() =>
            Alert.alert(
              label('Rebuild wallet ledger?'),
              label(
                'Recalculate historical wallet balances. Only run this to repair incorrect ledger values.',
              ),
              [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: label('Rebuild'),
                  style: 'destructive',
                  onPress: () => mutation.mutate(true),
                },
              ],
            )
          }
        />
      )}
      {mutation.isPending && (
        <Text style={{ color: colors.text }}>{label('Applying changes…')}</Text>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: colors.error }}>
          {error}
        </Text>
      )}
      {!!result && (
        <Text accessibilityRole="alert" style={{ color: colors.text }}>
          {result}
        </Text>
      )}
    </SectionCard>
  );
}
