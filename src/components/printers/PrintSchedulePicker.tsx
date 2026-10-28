import { translateNative, useNativeLocale, useTranslation } from '@/i18n';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { PrimaryButton } from '@/components/common/AppUI';
import { Choice, LaunchField, LaunchText } from './PrintOptionsForm';

import { spacing } from '@/theme/tokens';

export function PrintSchedulePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  useNativeLocale();
  const { t, language } = useTranslation();
  const parsed = new Date(value);
  const initial = Number.isFinite(parsed.getTime())
    ? parsed
    : new Date(Date.now() + 3600000);
  const [month, setMonth] = useState(
    new Date(initial.getFullYear(), initial.getMonth(), 1),
  );
  const selected = new Date(value || Date.now() + 3600000);
  const valid = Number.isFinite(selected.getTime());
  const selectedDate = valid ? selected : initial;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  useEffect(() => {
    if (!value) onChange(new Date(Date.now() + 3600000).toISOString());
  }, [value, onChange]);
  const update = (day: number, hour: number, minute: number) => {
    const date = new Date(
      month.getFullYear(),
      month.getMonth(),
      day,
      hour,
      minute,
    );
    onChange(date.toISOString());
  };
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <PrimaryButton
          label={t('printing.previousMonth', {
            defaultValue: 'Previous month',
          })}
          variant="secondary"
          onPress={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
          }
        />
        <PrimaryButton
          label={t('printing.nextMonth', { defaultValue: 'Next month' })}
          variant="secondary"
          onPress={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
          }
        />
      </View>
      <LaunchText>
        {new Intl.DateTimeFormat(language, {
          month: 'long',
          year: 'numeric',
        }).format(month)}
      </LaunchText>
      <Choice
        label={translateNative('native.e083a70d2399434b')}
        value={
          selectedDate.getMonth() === month.getMonth() &&
          selectedDate.getFullYear() === month.getFullYear()
            ? selectedDate.getDate()
            : 0
        }
        options={Array.from({ length: days }, (_, i) => ({
          value: i + 1,
          label: String(i + 1),
        }))}
        onChange={day =>
          update(day, selectedDate.getHours(), selectedDate.getMinutes())
        }
      />
      <Choice
        label={translateNative('native.4ee49c83f8a05072')}
        value={selectedDate.getHours()}
        options={Array.from({ length: 24 }, (_, i) => ({
          value: i,
          label: String(i).padStart(2, '0'),
        }))}
        onChange={hour =>
          update(selectedDate.getDate(), hour, selectedDate.getMinutes())
        }
      />
      <LaunchField
        numeric
        label={translateNative('native.9d4519c89d86c049')}
        value={String(selectedDate.getMinutes()).padStart(2, '0')}
        onChange={v => {
          const minute = Number(v);
          if (Number.isInteger(minute) && minute >= 0 && minute <= 59)
            update(selectedDate.getDate(), selectedDate.getHours(), minute);
        }}
      />
      <LaunchField
        label={translateNative('native.b9ffe393418b1126')}
        value={value}
        onChange={onChange}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
