import { nativeMessage, useNativeLocale, useNativeMessageState, useTranslation } from '@/i18n';

import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Input, PrimaryButton, SectionCard } from '@/components/common/AppUI';

import { useTheme } from '@/theme';
import {
  validCustomRange,
  type ReportRange,
  type ReportScope,
} from '@/utils/reports';

export const reportRangeKey = 'statistics-timeframe-v2';
export const reportPresets: ReportRange[] = [
  'today',
  'this-week',
  'this-month',
  '7d',
  '30d',
  '90d',
  'this-year',
  'all',
  'custom',
];
const names = [
  'Today',
  'This week',
  'This month',
  '7 Days',
  '30 Days',
  '90 Days',
  'This year',
  'All Time',
  'Custom dates',
];

export function ReportRangeControls({
  value,
  scope,
  onApply,
}: {
  value: ReportRange;
  scope: ReportScope;
  onApply: (range: ReportRange, scope?: ReportScope) => void;
}) {
  useNativeLocale();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [custom, setCustom] = useState(value === 'custom');
  const [from, setFrom] = useState(scope.dateFrom ?? '');
  const [to, setTo] = useState(scope.dateTo ?? '');
  const [error, setError] = useNativeMessageState('');
  const label = (text: string) => t(`stats.${text}`, { defaultValue: text });
  useEffect(() => {
    if (value === 'custom') {
      setCustom(true);
      setFrom(scope.dateFrom ?? '');
      setTo(scope.dateTo ?? '');
    }
  }, [value, scope.dateFrom, scope.dateTo]);
  function apply(range: ReportRange, dates?: ReportScope) {
    onApply(range, dates);
    AsyncStorage.setItem(
      reportRangeKey,
      JSON.stringify({ range, ...dates }),
    ).catch(() => setError(nativeMessage('Unable to retain timeframe')));
  }
  return (
    <SectionCard title={label('Report timeframe')}>
      {reportPresets.map((preset, index) => (
        <PrimaryButton
          key={preset}
          variant="secondary"
          label={`${label(names[index])}${value === preset ? ' ✓' : ''}`}
          onPress={() => {
            setError('');
            setCustom(preset === 'custom');
            if (preset !== 'custom') apply(preset);
          }}
        />
      ))}
      {custom && (
        <>
          <Input
            label={label('From (YYYY-MM-DD)')}
            value={from}
            onChangeText={setFrom}
            autoCapitalize="none"
          />
          <Input
            label={label('To (YYYY-MM-DD)')}
            value={to}
            onChangeText={setTo}
            autoCapitalize="none"
          />
          <PrimaryButton
            label={label('Apply dates')}
            onPress={() => {
              if (!validCustomRange(from, to)) {
                setError(nativeMessage('Enter valid dates with From on or before To'));
                return;
              }
              setError('');
              apply('custom', { dateFrom: from, dateTo: to });
            }}
          />
        </>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: colors.error }}>
          {error}
        </Text>
      )}
    </SectionCard>
  );
}
