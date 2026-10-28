import { translateNative, useNativeLocale, useNativeMessageState, useTranslation } from '@/i18n';

import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '@/api/notifications';
import { settingsApi } from '@/api/settings';
import { Button, Card, Input, SectionHeader } from '@/components/common/AppUI';
import { useAuth } from '@/contexts/AuthContext';

import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import type { NotificationTemplate } from '@/types/api';
import { NotificationToggle } from './ProviderEditorFields';

type Draft = { title_template: string; body_template: string };
export function insertTemplateVariable(text: string, variable: string, selection: { start: number; end: number }) {
  return text.slice(0, selection.start) + `{${variable}}` + text.slice(selection.end);
}
export function templateValidation(draft: Draft): string | null {
  if (!draft.title_template.trim() || !draft.body_template.trim()) return translateNative('native.2c32030eeb3aa54e');
  if (draft.title_template.length > 200) return translateNative('native.ddb64da82a403e5e');
  if (draft.body_template.length > 2000) return translateNative('native.3e1bc279d3f2235d');
  return null;
}

export function NotificationTemplateEditor({ template }: { template: NotificationTemplate }) {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const client = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => ({ title_template: template.title_template, body_template: template.body_template }));
  const [previewDraft, setPreviewDraft] = useState(draft);
  const [showPreview, setShowPreview] = useState(false);
  const [target, setTarget] = useState<keyof Draft>('body_template');
  const selection = useRef({ start: draft.body_template.length, end: draft.body_template.length });
  const [error, setError] = useNativeMessageState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const editable = hasPermission('notification_templates:update');
  const variables = useQuery({ queryKey: ['notificationTemplateVariables'], queryFn: notificationsApi.variables });
  const eventVariables = variables.data?.find(event => event.event_type === template.event_type);
  useEffect(() => {
    const timer = setTimeout(() => setPreviewDraft(draft), 300);
    return () => clearTimeout(timer);
  }, [draft]);
  const preview = useQuery({
    queryKey: ['notificationTemplatePreview', template.event_type, previewDraft],
    queryFn: () => notificationsApi.preview({ event_type: template.event_type, ...previewDraft }),
    enabled: showPreview && templateValidation(previewDraft) === null,
    retry: false,
  });
  const update = useMutation({
    mutationFn: () => settingsApi.updateNotificationTemplate(String(template.id), draft),
    onSuccess: async () => { setError(null); setSaved(true); await client.invalidateQueries({ queryKey: ['notificationTemplates'] }); },
    onError: (err: Error) => setError(err.message),
  });
  const reset = useMutation({
    mutationFn: () => settingsApi.resetNotificationTemplate(String(template.id)),
    onSuccess: async result => {
      setDraft({ title_template: result.title_template, body_template: result.body_template });
      setError(null); setSaved(false);
      await client.invalidateQueries({ queryKey: ['notificationTemplates'] });
    },
    onError: (err: Error) => setError(err.message),
  });
  const change = (key: keyof Draft, value: string) => {
    setDraft(current => ({ ...current, [key]: value })); setSaved(false); setError(null);
  };
  const validation = templateValidation(draft);
  return (
    <View style={[styles.editor, { borderColor: colors.border }]}>
      <Text accessibilityRole="header" style={{ color: colors.text }}>{template.name}</Text>
      <Text style={{ color: colors.textSecondary }}>{template.event_type}</Text>
      {(['title_template', 'body_template'] as const).map(key => (
        <Input key={key} label={key === 'title_template' ? t('notifications.templateTitle', { defaultValue: 'Title template' }) : t('notifications.templateBody', { defaultValue: 'Body template' })}
          value={draft[key]} editable={editable} multiline={key === 'body_template'}
          onFocus={() => { setTarget(key); selection.current = { start: draft[key].length, end: draft[key].length }; }}
          onSelectionChange={event => { setTarget(key); selection.current = event.nativeEvent.selection; }}
          onChangeText={value => change(key, value)} />
      ))}
      <Text style={{ color: colors.textSecondary }}>{t('notifications.variableReference', {
        defaultValue: 'Variables for this event. Tap to insert into the focused title or body.',
      })}</Text>
      {variables.error ? <Text style={{ color: colors.error }}>{variables.error.message}</Text> : null}
      <View style={styles.actions}>
        {eventVariables?.variables.map(variable => (
          <Button key={variable} title={`{${variable}}`} size="sm" variant="secondary" disabled={!editable}
            onPress={() => {
              const next = insertTemplateVariable(draft[target], variable, selection.current);
              const start = selection.current.start + variable.length + 2;
              change(target, next);
              selection.current = { start, end: start };
            }} />
        ))}
      </View>
      <NotificationToggle label={t('notifications.livePreview', { defaultValue: 'Live preview with sample event data' })}
        value={showPreview} onChange={setShowPreview} />
      {showPreview ? (
        <View style={styles.group}>
          {validation ? <Text accessibilityRole="alert" style={{ color: colors.error }}>{t('notifications.templateValidation', { defaultValue: validation })}</Text> : null}
          {preview.isFetching ? <Text style={{ color: colors.textSecondary }}>{t('notifications.rendering', { defaultValue: 'Rendering preview…' })}</Text> : null}
          {preview.error ? <Text accessibilityRole="alert" style={{ color: colors.error }}>{preview.error.message}</Text> : null}
          {!validation && preview.data ? <>
            <Text selectable style={{ color: colors.text }}>{preview.data.title}</Text>
            <Text selectable style={{ color: colors.text }}>{preview.data.body}</Text>
          </> : null}
        </View>
      ) : null}
      {error ? <Text accessibilityRole="alert" style={{ color: colors.error }}>{error}</Text> : null}
      {saved ? <Text style={{ color: colors.success }}>{t('notifications.templateSaved', { defaultValue: 'Template saved.' })}</Text> : null}
      {editable ? <View style={styles.actions}>
        <Button title={t('common.save')} disabled={update.isPending || reset.isPending} loading={update.isPending}
          onPress={() => { setError(validation); if (!validation) update.mutate(); }} />
        <Button title={t('common.reset', { defaultValue: 'Reset to default' })} variant="secondary"
          disabled={update.isPending || reset.isPending} loading={reset.isPending} onPress={() => reset.mutate()} />
      </View> : null}
    </View>
  );
}

export function NotificationTemplates() {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const templates = useQuery({ queryKey: ['notificationTemplates'], queryFn: settingsApi.getNotificationTemplates });
  const needle = search.trim().toLocaleLowerCase();
  return (
    <Card>
      <SectionHeader title={t('notifications.templates', { defaultValue: 'Notification templates' })} />
      <View style={styles.group}>
        <Input label={t('notifications.searchTemplates', { defaultValue: 'Search templates by name or event' })}
          value={search} onChangeText={setSearch} />
        {templates.isLoading ? <Text style={{ color: colors.textSecondary }}>{t('common.loading', { defaultValue: 'Loading…' })}</Text> : null}
        {templates.error ? <Text style={{ color: colors.error }}>{templates.error.message}</Text> : null}
        {templates.data?.map(record => {
          const template = record as unknown as NotificationTemplate;
          const matches = `${template.name} ${template.event_type}`.toLocaleLowerCase().includes(needle);
          // Keep editors mounted while searching so unsaved drafts survive filtering.
          return <View key={template.id} style={matches ? undefined : styles.hidden}>
            <NotificationTemplateEditor template={template} />
          </View>;
        })}
        {templates.data && !templates.data.some(template => `${template.name} ${template.event_type}`.toLocaleLowerCase().includes(needle))
          ? <Text style={{ color: colors.textSecondary }}>{t('notifications.noTemplates', { defaultValue: 'No matching templates.' })}</Text> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm }, editor: { borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, hidden: { display: 'none' },
});
