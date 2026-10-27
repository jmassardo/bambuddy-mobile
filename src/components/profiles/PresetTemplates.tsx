import React, { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PrimaryButton,
  TextField,
  InlineTabBar,
} from '@/components/common/AppUI';
import { useToast } from '@/contexts/ToastContext';
import { useTranslation } from '@/i18n';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';

interface Template {
  id: string;
  name: string;
  description: string;
  type: string;
  settings: Record<string, unknown>;
  showInModal: boolean;
}
const STORAGE_KEY = 'bambuddy_preset_templates';
export function PresetTemplates({
  type,
  settings,
  onApply,
}: {
  type: string;
  settings: Record<string, unknown>;
  onApply: (setting: Record<string, unknown>, type: string) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { showToast } = useToast();
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [showHidden, setShowHidden] = useState(false);
  const query = useQuery({
    queryKey: ['presetTemplates'],
    queryFn: async (): Promise<Template[]> => {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      return stored ? (JSON.parse(stored) as Template[]) : [];
    },
  });
  const mutation = useMutation({
    mutationFn: async (templates: Template[]) => {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
      return templates;
    },
    onSuccess: templates => {
      client.setQueryData(['presetTemplates'], templates);
      setEditing(null);
      setName('');
      setDescription('');
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const templates = query.data ?? [];
  return (
    <View style={styles.body}>
      <Text style={{ color: colors.text }}>
        {t('profiles.templates.title', { defaultValue: 'Reusable templates' })}
      </Text>
      {query.isError ? (
        <PrimaryButton
          label={t('common.retry', { defaultValue: 'Retry' })}
          onPress={() => void query.refetch()}
        />
      ) : null}
      <TextField
        label={t('profiles.templates.name', { defaultValue: 'Template name' })}
        value={name}
        onChangeText={setName}
      />
      <TextField
        label={t('profiles.templates.description', {
          defaultValue: 'Description',
        })}
        value={description}
        onChangeText={setDescription}
      />
      <PrimaryButton
        label={
          editing
            ? t('profiles.templates.update', {
                defaultValue: 'Update template metadata',
              })
            : t('profiles.templates.save', {
                defaultValue: 'Save current changes as template',
              })
        }
        disabled={!name.trim() || mutation.isPending || query.isLoading}
        onPress={() => {
          const next = editing
            ? templates.map(template =>
                template.id === editing
                  ? { ...template, name: name.trim(), description }
                  : template,
              )
            : [
                ...templates,
                {
                  id: `${Date.now()}-${Math.random()}`,
                  name: name.trim(),
                  description,
                  type,
                  settings,
                  showInModal: true,
                },
              ];
          mutation.mutate(next);
        }}
      />
      {editing ? (
        <PrimaryButton
          label={t('common.cancel')}
          variant="secondary"
          onPress={() => {
            setEditing(null);
            setName('');
            setDescription('');
          }}
        />
      ) : null}
      <InlineTabBar
        value={filter}
        tabs={['all', 'filament', 'print', 'printer'].map(key => ({
          key,
          label: key,
        }))}
        onChange={setFilter}
      />
      <PrimaryButton
        label={
          showHidden
            ? t('profiles.templates.hideHidden', {
                defaultValue: 'Hide templates disabled in editor',
              })
            : t('profiles.templates.showHidden', {
                defaultValue: 'Manage hidden templates',
              })
        }
        variant="secondary"
        onPress={() => setShowHidden(!showHidden)}
      />
      {templates
        .filter(
          template =>
            (filter === 'all' || template.type === filter) &&
            (showHidden || template.showInModal !== false),
        )
        .map(template => (
          <View key={template.id} style={styles.template}>
            <Text style={{ color: colors.text }}>
              {template.name} · {template.type}
            </Text>
            <Text style={{ color: colors.textSecondary }}>
              {template.description}
            </Text>
            <Text style={{ color: colors.textSecondary }}>
              {t('profiles.templates.visible', {
                defaultValue: 'Show in editor',
              })}
            </Text>
            <Switch
              accessibilityLabel={t('profiles.templates.visible', {
                defaultValue: 'Show in editor',
              })}
              value={template.showInModal !== false}
              disabled={mutation.isPending}
              onValueChange={showInModal =>
                mutation.mutate(
                  templates.map(item =>
                    item.id === template.id ? { ...item, showInModal } : item,
                  ),
                )
              }
            />
            <PrimaryButton
              label={t('profiles.templates.apply', {
                defaultValue: 'Apply template',
              })}
              onPress={() => onApply(template.settings, template.type)}
            />
            <PrimaryButton
              label={t('common.edit', { defaultValue: 'Edit' })}
              variant="secondary"
              onPress={() => {
                setEditing(template.id);
                setName(template.name);
                setDescription(template.description);
              }}
            />
            <PrimaryButton
              label={t('common.delete')}
              variant="danger"
              disabled={mutation.isPending}
              onPress={() =>
                Alert.alert(
                  t('profiles.templates.delete', {
                    defaultValue: 'Delete template?',
                  }),
                  template.name,
                  [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                      text: t('common.delete'),
                      style: 'destructive',
                      onPress: () =>
                        mutation.mutate(
                          templates.filter(item => item.id !== template.id),
                        ),
                    },
                  ],
                )
              }
            />
          </View>
        ))}
    </View>
  );
}
const styles = StyleSheet.create({
  body: { gap: spacing.sm },
  template: { gap: spacing.sm, paddingVertical: spacing.md },
});
