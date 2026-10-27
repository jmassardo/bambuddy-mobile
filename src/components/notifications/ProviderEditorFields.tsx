import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { printersApi } from '@/api/printers';
import { Button, Input } from '@/components/common/AppUI';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import { useTranslation } from '@/i18n';
import {
  PROVIDER_EVENTS, PROVIDER_FIELDS, type ProviderFormState,
} from '@/utils/notificationProvider';

type Props = {
  form: ProviderFormState;
  setForm: React.Dispatch<React.SetStateAction<ProviderFormState>>;
};

export function NotificationToggle({ label, value, onChange }: {
  label: string; value: boolean; onChange: (value: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} />
    </View>
  );
}

export function NotificationChoices({ label, value, choices, onChange }: {
  label: string; value: string; choices: readonly string[]; onChange: (value: string) => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.group}>
      <Text style={{ color: colors.text }}>{label}</Text>
      <View style={styles.choices}>
        {choices.map(choice => (
          <Button key={choice} title={choice ? t(`notifications.choice.${choice}`, { defaultValue: choice }) : t('common.default', { defaultValue: 'Default' })} size="sm"
            variant={choice === value ? 'primary' : 'secondary'} onPress={() => onChange(choice)} />
        ))}
      </View>
    </View>
  );
}

export function ProviderConfigFields({ form, setForm }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const update = (key: string, value: string) => setForm(current => ({
    ...current, config: { ...current.config, [key]: value },
  }));
  const fields = PROVIDER_FIELDS[form.kind];
  if (!fields) return <Text style={{ color: colors.warning }}>{t('notifications.unsupportedProvider', {
    defaultValue: 'Unsupported provider type: {{kind}}. Existing configuration is preserved. Update the app to edit it.', kind: form.kind,
  })}</Text>;
  return (
    <View style={styles.group}>
      {fields.filter(f => {
        if (form.kind === 'pushover' && ['retry', 'expire'].includes(f.key)) return form.config.priority === '2';
        if (form.kind === 'generic_webhook' && ['field_title', 'field_message'].includes(f.key)) return form.config.payload_format !== 'slack';
        return true;
      }).map(f => f.choices ? (
        <NotificationChoices key={f.key} label={t(`notifications.field.${f.key}`, { defaultValue: f.label })} value={form.config[f.key] ?? ''}
          choices={f.choices} onChange={value => update(f.key, value)} />
      ) : (
        <Input key={f.key} label={`${t(`notifications.field.${f.key}`, { defaultValue: f.label })}${f.required ? ' *' : ''}`}
          value={form.config[f.key] ?? ''} autoCapitalize="none" autoCorrect={false}
          secureTextEntry={f.secret} multiline={f.key === 'data'}
          onChangeText={value => update(f.key, value)} />
      ))}
    </View>
  );
}

export function ProviderDeliveryFields({ form, setForm }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const printers = useQuery({ queryKey: ['printers'], queryFn: printersApi.getPrinters });
  const update = (patch: Partial<ProviderFormState>) => setForm(current => ({ ...current, ...patch }));
  const selectedPrinter = printers.data?.find(printer => Number(printer.id) === form.printer_id);
  return (
    <View style={styles.group}>
      <Text style={{ color: colors.text }}>{t('notifications.printerRouting', { defaultValue: 'Printer routing' })}</Text>
      <Text style={{ color: colors.textSecondary }}>
        {form.printer_id === null ? t('notifications.allPrinters', { defaultValue: 'All printers' }) : selectedPrinter?.name ?? t('notifications.unavailablePrinter', { defaultValue: 'Printer #{{id}} (unavailable)', id: form.printer_id })}
      </Text>
      {printers.error ? <Text style={{ color: colors.error }}>{printers.error.message}</Text> : null}
      <View style={styles.choices}>
        <Button title={t('notifications.allPrinters', { defaultValue: 'All printers' })} size="sm" variant={form.printer_id === null ? 'primary' : 'secondary'}
          onPress={() => update({ printer_id: null })} />
        {printers.data?.map(printer => (
          <Button key={String(printer.id)} title={String(printer.name)} size="sm"
            variant={form.printer_id === Number(printer.id) ? 'primary' : 'secondary'}
            onPress={() => update({ printer_id: Number(printer.id) })} />
        ))}
      </View>
      <NotificationToggle label={t('notifications.attachPhoto', { defaultValue: 'Attach camera photo' })} value={form.attach_photo} onChange={value => update({ attach_photo: value })} />
      <NotificationToggle label={t('notifications.quietHours', { defaultValue: 'Quiet hours' })} value={form.quiet_hours_enabled} onChange={value => update({ quiet_hours_enabled: value })} />
      {form.quiet_hours_enabled ? (
        <>
          <Input label={t('notifications.quietStart', { defaultValue: 'Quiet hours start (HH:MM)' })} value={form.quiet_hours_start} onChangeText={value => update({ quiet_hours_start: value })} />
          <Input label={t('notifications.quietEnd', { defaultValue: 'Quiet hours end (HH:MM)' })} value={form.quiet_hours_end} onChangeText={value => update({ quiet_hours_end: value })} />
          <Text style={{ color: colors.textSecondary }}>{t('notifications.serverLocalTime', { defaultValue: 'Uses server local time; crossing midnight is supported.' })}</Text>
        </>
      ) : null}
      <NotificationToggle label={t('notifications.dailyDigest', { defaultValue: 'Daily digest' })} value={form.daily_digest_enabled} onChange={value => update({ daily_digest_enabled: value })} />
      {form.daily_digest_enabled ? <Input label={t('notifications.digestTime', { defaultValue: 'Daily digest time (HH:MM)' })} value={form.daily_digest_time}
        onChangeText={value => update({ daily_digest_time: value })} /> : null}
      {form.kind === 'telegram' ? <NotificationChoices label={t('notifications.telegramVerdict', { defaultValue: 'Telegram outcome verdict mode' })} value={form.telegram_verdict_mode}
        choices={['buttons', 'reactions', 'both']} onChange={value => update({ telegram_verdict_mode: value as ProviderFormState['telegram_verdict_mode'] })} /> : null}
      <Text style={{ color: colors.text }}>{t('notifications.eventSubscriptions', { defaultValue: 'Event subscriptions (independent of personal email)' })}</Text>
      {PROVIDER_EVENTS.map(([key, label]) => (
        <View key={key}>
          <NotificationToggle label={t(`notifications.event.${key}`, { defaultValue: label })} value={form.events[key]}
            onChange={value => setForm(current => ({ ...current, events: { ...current.events, [key]: value } }))} />
          {form.kind === 'ntfy' && form.events[key] ? (
            <NotificationChoices label={t('notifications.eventPriority', { defaultValue: '{{event}} priority (1 min – 5 urgent)', event: t(`notifications.event.${key}`, { defaultValue: label }) })} value={String(form.eventPriorities[key] ?? 3)}
              choices={['1', '2', '3', '4', '5']} onChange={value => setForm(current => ({
                ...current, eventPriorities: { ...current.eventPriorities, [key]: Number(value) },
              }))} />
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  label: { flex: 1 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
