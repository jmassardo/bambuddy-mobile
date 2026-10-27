import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '@/api/settings';
import { Button, Input } from '@/components/common/AppUI';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import { useTranslation } from '@/i18n';

export function BedCooledThreshold() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['settings'], queryFn: settingsApi.getSettings });
  const [value, setValue] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (query.data && !dirty) setValue(String(query.data.bed_cooled_threshold ?? 35));
  }, [query.data, dirty]);
  const valid = /^\d+$/.test(value) && Number(value) >= 20 && Number(value) <= 80;
  const mutation = useMutation({
    mutationFn: () => settingsApi.updateSettings({ bed_cooled_threshold: Number(value) }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['settings'] });
      setDirty(false);
      setSaved(true);
    },
  });
  return (
    <View style={styles.group}>
      <Input label={t('notifications.bedThreshold', { defaultValue: 'Bed-cooled notification threshold (°C, 20–80)' })} keyboardType="number-pad"
        value={value} onChangeText={text => { setValue(text); setDirty(true); setSaved(false); }} />
      <Text style={{ color: colors.textSecondary }}>{t('notifications.bedThresholdHelp', { defaultValue: 'Send bed-cooled events when the bed falls to this temperature after a print.' })}</Text>
      {dirty && !valid ? <Text style={{ color: colors.error }}>{t('notifications.bedThresholdInvalid', { defaultValue: 'Enter a whole temperature between 20 and 80 °C.' })}</Text> : null}
      {query.error || mutation.error ? <Text style={{ color: colors.error }}>{(query.error ?? mutation.error)?.message}</Text> : null}
      {saved ? <Text style={{ color: colors.success }}>{t('notifications.bedThresholdSaved', { defaultValue: 'Bed-cooled threshold saved.' })}</Text> : null}
      <Button title={t('notifications.saveBedThreshold', { defaultValue: 'Save bed-cooled threshold' })} disabled={!valid || !dirty || mutation.isPending}
        onPress={() => mutation.mutate()} loading={mutation.isPending} />
    </View>
  );
}

const styles = StyleSheet.create({ group: { gap: spacing.sm } });
