import { translateNative, useNativeLocale, useNativeMessageState, useTranslation } from '@/i18n';

import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '@/api/settings';
import { notificationsApi } from '@/api/notifications';
import { Button, Card, Input, SectionHeader } from '@/components/common/AppUI';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useAuth } from '@/contexts/AuthContext';

import { useTheme } from '@/theme';
import { borderRadius, spacing } from '@/theme/tokens';
import type { NotificationProvider, NotificationProviderCreate } from '@/types/api';
import {
  buildProviderPayload, changeProviderKind, emptyProviderForm, formFromProvider,
  PROVIDER_OPTIONS, validateProviderForm,
} from '@/utils/notificationProvider';
import { NotificationToggle, ProviderConfigFields, ProviderDeliveryFields } from './ProviderEditorFields';

export function NotificationProviders() {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const client = useQueryClient();
  const [form, setForm] = useState(emptyProviderForm);
  const [editing, setEditing] = useState<NotificationProvider | null>(null);
  const [visible, setVisible] = useState(false);
  const [deleting, setDeleting] = useState<NotificationProvider | null>(null);
  const [error, setError] = useNativeMessageState<string | null>(null);
  const providers = useQuery({ queryKey: ['notificationProviders'], queryFn: settingsApi.getNotificationProviders });
  const refresh = () => client.invalidateQueries({ queryKey: ['notificationProviders'] });
  const close = () => { setVisible(false); setError(null); draftTest.reset(); };
  const save = useMutation({
    mutationFn: (payload: NotificationProviderCreate) => editing
      ? settingsApi.updateNotificationProvider(editing.id, payload as unknown as Record<string, unknown>)
      : settingsApi.createNotificationProvider(payload as unknown as Record<string, unknown>),
    onSuccess: async () => { await refresh(); close(); },
    onError: (err: Error) => setError(err.message),
  });
  const remove = useMutation({
    mutationFn: settingsApi.deleteNotificationProvider,
    onSuccess: async () => { await refresh(); setDeleting(null); },
  });
  const savedTest = useMutation({
    mutationFn: settingsApi.testNotificationProvider, onSuccess: refresh,
  });
  const allTest = useMutation({ mutationFn: notificationsApi.testAll, onSuccess: refresh });
  const draftTest = useMutation({ mutationFn: notificationsApi.testDraft });
  const resetDraftTest = draftTest.reset;
  useEffect(() => { resetDraftTest(); }, [form, resetDraftTest]);
  const begin = (provider?: NotificationProvider) => {
    setEditing(provider ?? null);
    setForm(provider ? formFromProvider(provider) : emptyProviderForm());
    setError(null); save.reset(); draftTest.reset(); setVisible(true);
  };
  const validate = (mode: 'save' | 'test' = 'save') => {
    const message = validateProviderForm(form, mode);
    setError(message);
    return !message;
  };
  return (
    <Card>
      <SectionHeader title={t('notifications.providers', { defaultValue: 'Notification providers' })}
        action={hasPermission('notifications:create') ? { get label() { return translateNative('common.add', { defaultValue: 'Add' }); }, onPress: () => begin() } : undefined} />
      {providers.isLoading ? <Text style={{ color: colors.textSecondary }}>{t('common.loading', { defaultValue: 'Loading…' })}</Text> : null}
      {providers.error ? <Text style={{ color: colors.error }}>{providers.error.message}</Text> : null}
      {providers.data?.length === 0 ? <Text style={{ color: colors.textSecondary }}>{t('notifications.noProviders', { defaultValue: 'No providers configured.' })}</Text> : null}
      <View style={styles.group}>
        {providers.data?.map(record => {
          const provider = record as unknown as NotificationProvider;
          return (
            <View key={provider.id} style={[styles.provider, { borderColor: colors.border }]}>
              <Text style={{ color: colors.text }}>{provider.name} · {provider.provider_type} · {provider.enabled
                ? t('common.enabled', { defaultValue: 'Enabled' }) : t('common.disabled', { defaultValue: 'Disabled' })}</Text>
              {provider.last_success ? <Text style={{ color: colors.textSecondary }}>{t('notifications.lastSuccess', { defaultValue: 'Last success: {{time}}', time: provider.last_success })}</Text> : null}
              {provider.last_error ? <Text selectable style={{ color: colors.error }}>{provider.last_error}</Text> : null}
              <View style={styles.actions}>
                {hasPermission('notifications:update') ? (
                  <>
                    <Button title={t('common.test', { defaultValue: 'Test' })} size="sm" variant="secondary"
                      disabled={savedTest.isPending} onPress={() => savedTest.mutate(provider.id)} />
                    <Button title={t('common.edit', { defaultValue: 'Edit' })} size="sm" variant="secondary" onPress={() => begin(provider)} />
                  </>
                ) : null}
                {hasPermission('notifications:delete') ? <Button title={t('common.delete', { defaultValue: 'Delete' })} size="sm" variant="danger" onPress={() => setDeleting(provider)} /> : null}
              </View>
              {savedTest.variables === provider.id && savedTest.data ? <Text selectable style={{ color: savedTest.data.success ? colors.success : colors.error }}>{savedTest.data.message}</Text> : null}
              {savedTest.variables === provider.id && savedTest.error ? <Text style={{ color: colors.error }}>{savedTest.error.message}</Text> : null}
            </View>
          );
        })}
        {hasPermission('notifications:update') ? <Button title={t('notifications.testAll', { defaultValue: 'Test all enabled providers' })}
          onPress={() => allTest.mutate()} loading={allTest.isPending} disabled={allTest.isPending} variant="secondary" /> : null}
        {allTest.error ? <Text style={{ color: colors.error }}>{allTest.error.message}</Text> : null}
        {allTest.data ? (
          <View style={styles.group}>
            <Text style={{ color: colors.text }}>{t('notifications.testSummary', {
              defaultValue: '{{tested}} tested · {{success}} succeeded · {{failed}} failed',
              tested: allTest.data.tested, success: allTest.data.success, failed: allTest.data.failed,
            })}</Text>
            {allTest.data.results.map(result => (
              <Text selectable key={result.provider_id} style={{ color: result.success ? colors.success : colors.error }}>
                {result.provider_name}: {result.success ? t('notifications.sent', { defaultValue: 'Sent' }) : t('notifications.failed', { defaultValue: 'Failed' })} — {result.message}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
        <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
          <Pressable accessibilityLabel={t('common.close', { defaultValue: 'Close' })} style={StyleSheet.absoluteFill} onPress={close} />
          <View style={[styles.modal, { backgroundColor: colors.modalBg }]}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
              <Text accessibilityRole="header" style={{ color: colors.text }}>{editing
                ? t('notifications.editProvider', { defaultValue: 'Edit provider' }) : t('notifications.addProvider', { defaultValue: 'Add provider' })}</Text>
              <Input label={t('notifications.providerName', { defaultValue: 'Provider name' })} value={form.name}
                onChangeText={value => setForm(current => ({ ...current, name: value }))} />
              <View style={styles.actions}>
                {PROVIDER_OPTIONS.map(option => <Button key={option.key} title={t(`notifications.provider.${option.key}`, { defaultValue: option.label })} size="sm"
                  variant={form.kind === option.key ? 'primary' : 'secondary'} onPress={() => {
                    draftTest.reset();
                    setForm(current => changeProviderKind(current, option.key));
                  }} />)}
              </View>
              <NotificationToggle label={t('common.enabled', { defaultValue: 'Enabled' })} value={form.enabled}
                onChange={value => setForm(current => ({ ...current, enabled: value }))} />
              <ProviderConfigFields form={form} setForm={setForm} />
              {hasPermission('notifications:create') ? <Button title={t('notifications.testDraft', { defaultValue: 'Test draft without saving' })} variant="secondary"
                disabled={draftTest.isPending} loading={draftTest.isPending} onPress={() => {
                  if (validate('test')) {
                    const payload = buildProviderPayload(form);
                    draftTest.mutate({ provider_type: payload.provider_type, config: payload.config, attach_photo: payload.attach_photo });
                  }
                }} /> : null}
              {draftTest.data ? <Text selectable style={{ color: draftTest.data.success ? colors.success : colors.error }}>{draftTest.data.message}</Text> : null}
              {draftTest.error ? <Text style={{ color: colors.error }}>{draftTest.error.message}</Text> : null}
              <ProviderDeliveryFields form={form} setForm={setForm} />
              {error ? <Text accessibilityRole="alert" style={{ color: colors.error }}>{t('notifications.validationError', { defaultValue: error })}</Text> : null}
              <View style={styles.actions}>
                <Button title={t('common.cancel')} variant="secondary" onPress={close} />
                <Button title={t('common.save')} disabled={save.isPending} loading={save.isPending}
                  onPress={() => { if (validate()) save.mutate(buildProviderPayload(form)); }} />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
      <ConfirmModal visible={deleting !== null} onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) remove.mutate(deleting.id); }}
        title={t('notifications.deleteProvider', { defaultValue: 'Delete notification provider' })}
        message={t('notifications.deleteProviderConfirm', { defaultValue: 'Delete {{name}}?', name: deleting?.name ?? '' })}
        confirmLabel={t('common.delete', { defaultValue: 'Delete' })} loading={remove.isPending} />
      {remove.error ? <Text style={{ color: colors.error }}>{remove.error.message}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.md },
  provider: { borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  backdrop: { flex: 1, justifyContent: 'flex-end', padding: spacing.md },
  modal: { maxHeight: '92%', borderRadius: borderRadius.xl },
  content: { padding: spacing.lg, gap: spacing.md },
});
