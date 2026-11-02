import { nativeMessage, translateNative, useLocalizedMemo, useNativeLocale, useNativeMessageState, useTranslation } from '@/i18n';


import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { profileManagementApi } from '@/api/profileManagement';
import {
  InlineTabBar,
  PrimaryButton,
  TextField,
} from '@/components/common/AppUI';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import type { PresetField } from '@/types/api';
import {
  isCustomCloudPreset,
  parsePresetJson,
  presetDiff,
  resolvePresetInheritance,
  typedPresetValue,
} from '@/utils/profilePresets';
import { pickProfileJson, shareProfileJson } from '@/utils/profileFiles';
import { PresetTemplates } from './PresetTemplates';

function displayFieldValue(input: unknown): string {
  if (Array.isArray(input) && input.length <= 1)
    return displayFieldValue(input[0]);
  return typeof input === 'object' && input !== null
    ? JSON.stringify(input)
    : String(input ?? '');
}
function FieldEditor({
  field,
  value,
  onChange,
  onValidation,
}: {
  field?: PresetField;
  value: unknown;
  onChange: (value: unknown) => void;
  onValidation: (error: string) => void;
}) {
  useNativeLocale();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [text, setText] = useState(displayFieldValue(value));
  const [error, setError] = useNativeMessageState('');
  useEffect(() => {
    setText(displayFieldValue(value));
    setError('');
  }, [setError, value]);
  const commit = (input: string) => {
    setText(input);
    try {
      onChange(typedPresetValue(input, value, field));
      setError('');
      onValidation('');
    } catch (failure) {
      setError(String(failure));
      onValidation(String(failure));
    }
  };
  return (
    <View style={styles.body}>
      <TextField
        label={
          field?.label ??
          field?.key ??
          t('profiles.value', { defaultValue: 'Value' })
        }
        value={text}
        onChangeText={commit}
        multiline={
          (Array.isArray(value) && value.length > 1) ||
          (typeof value === 'object' && value !== null && !Array.isArray(value))
        }
        keyboardType={field?.type === 'number' ? 'decimal-pad' : 'default'}
      />
      {field?.type === 'boolean' ? (
        <Switch
          value={['true', '1'].includes(text)}
          onValueChange={checked =>
            commit(
              typeof (Array.isArray(value) ? value[0] : value) === 'string'
                ? checked
                  ? '1'
                  : '0'
                : String(checked),
            )
          }
        />
      ) : null}
      {field?.type === 'select' && field.options ? (
        <ScrollView horizontal contentContainerStyle={styles.options}>
          {field.options.map(option => {
            const record =
              option && typeof option === 'object'
                ? (option as Record<string, unknown>)
                : null;
            const key = String(record?.value ?? option);
            return (
              <PrimaryButton
                key={key}
                label={String(record?.label ?? key)}
                variant="secondary"
                onPress={() => commit(key)}
              />
            );
          })}
        </ScrollView>
      ) : null}
      {error ? <Text style={{ color: colors.error }}>{error}</Text> : null}
    </View>
  );
}

export function PresetEditor({
  visible,
  profile,
  duplicate = false,
  profiles,
  onClose,
}: {
  visible: boolean;
  profile: Record<string, unknown> | null;
  duplicate?: boolean;
  profiles: Record<string, unknown>[];
  onClose: () => void;
}) {
  useNativeLocale();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const client = useQueryClient();
  const id = profile?.setting_id ? String(profile.setting_id) : '';
  const [name, setName] = useState('');
  const [type, setType] = useState('filament');
  const [baseId, setBaseId] = useState('');
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [raw, setRaw] = useState('{}');
  const [rawError, setRawError] = useNativeMessageState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [mode, setMode] = useState('fields');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [changedOnly, setChangedOnly] = useState(false);
  const [customKey, setCustomKey] = useState('');
  const [customValue, setCustomValue] = useState('');
  const [customType, setCustomType] = useState('string');
  const detail = useQuery({
    queryKey: ['presetEditor', id],
    queryFn: () => profileManagementApi.detail(id),
    enabled: visible && !!id,
  });
  const base = useQuery({
    queryKey: ['presetBase', baseId, profiles],
    queryFn: () =>
      resolvePresetInheritance(baseId, profiles, profileManagementApi.detail),
    enabled: visible && !!baseId,
  });
  const fields = useQuery({
    queryKey: ['presetFields', type],
    queryFn: () => profileManagementApi.fields(type),
    enabled: visible,
  });
  useEffect(() => {
    if (!visible) return;
    if (id && !detail.data) return;
    const data = detail.data;
    setName(data ? `${data.name}${duplicate ? ' (copy)' : ''}` : '');
    setType(
      String(data?.type ?? profile?.type ?? 'filament').replace(
        /^process$/,
        'print',
      ),
    );
    setBaseId(
      duplicate
        ? data?.base_id || (isCustomCloudPreset(profile) ? '' : id)
        : data?.base_id ?? '',
    );
    setSettings(data?.setting ?? {});
    setRaw(JSON.stringify(data?.setting ?? {}, null, 2));
    setMode('fields');
    setRawError('');
    setFieldErrors({});
  }, [visible, id, detail.data, duplicate, profile, setRawError]);
  const definitionList = useLocalizedMemo(
    () =>
      Array.isArray(fields.data?.fields)
        ? (fields.data.fields as PresetField[])
        : [],
    [fields.data],
  );
  const definitionMap = useLocalizedMemo(
    () => new Map(definitionList.map(field => [field.key, field])),
    [definitionList],
  );
  const inherited = base.data?.setting ?? {};
  const entries = presetDiff(settings, inherited);
  const allKeys = [
    ...new Set([
      ...entries.map(entry => entry.key),
      ...definitionList.map(field => field.key),
    ]),
  ].sort();
  const canEdit =
    hasPermission('cloud:auth') &&
    (!id || duplicate || profile?.is_custom === true) &&
    detail.data?.public !== true;
  // Public profiles can always be duplicated, but never overwritten.
  const canSave = hasPermission('cloud:auth') && (!id || duplicate || canEdit);
  const commitSettings = (value: Record<string, unknown>) => {
    setSettings(value);
    setRaw(JSON.stringify(value, null, 2));
    setRawError('');
  };
  const mutation = useMutation({
    mutationFn: async (operation: 'save' | 'delete') => {
      if (operation === 'delete') return profileManagementApi.remove(id);
      const setting = mode === 'json' ? parsePresetJson(raw) : settings;
      if (!name.trim())
        throw new Error(
          t('profiles.nameRequired', {
            defaultValue: 'Preset name is required.',
          }),
        );
      const settingsId =
        type === 'filament'
          ? 'filament_settings_id'
          : type === 'print'
          ? 'print_settings_id'
          : 'printer_settings_id';
      const namedSetting = {
        ...setting,
        [settingsId]: `"${name.trim()}"`,
      };
      if (!id || duplicate) {
        if (!baseId.trim())
          throw new Error(
            t('profiles.baseRequired', {
              defaultValue: 'Select or enter a base preset ID.',
            }),
          );
        return profileManagementApi.create({
          name: name.trim(),
          type,
          base_id: baseId,
          version: detail.data?.version ?? '2.0.0.0',
          setting: namedSetting,
        });
      }
      return profileManagementApi.update(id, {
        name: name.trim(),
        setting: namedSetting,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['cloudProfiles'] }),
        client.invalidateQueries({ queryKey: ['presetEditor'] }),
        client.invalidateQueries({ queryKey: ['cloudProfileDetail'] }),
      ]);
      showToast(
        nativeMessage('profiles.saved', () => ({ defaultValue: 'Preset changes saved.' })),
        'success',
      );
      onClose();
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      showToast(String(error), 'error');
    }
  };
  const switchMode = (next: string) => {
    if (Object.keys(fieldErrors).length) {
      showToast(
        nativeMessage('profiles.fixFieldErrors', () => ({
          defaultValue:
            'Correct invalid field values before changing editor mode.',
        })),
        'error',
      );
      return;
    }
    if (mode === 'json') {
      try {
        commitSettings(parsePresetJson(raw));
      } catch (error) {
        setRawError(String(error));
        return;
      }
    }
    setMode(next);
  };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ScrollView
        contentContainerStyle={[
          styles.modal,
          { backgroundColor: colors.background },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ color: colors.text }}>
          {t('profiles.editor', { defaultValue: 'Preset editor' })}
        </Text>
        <PrimaryButton
          label={t('common.close', { defaultValue: 'Close' })}
          variant="secondary"
          disabled={mutation.isPending}
          onPress={onClose}
        />
        {detail.isLoading && id ? (
          <Text style={{ color: colors.text }}>
            {t('common.loading', { defaultValue: 'Loading…' })}
          </Text>
        ) : null}
        {detail.isError ? (
          <PrimaryButton
            label={t('common.retry', { defaultValue: 'Retry loading preset' })}
            onPress={() => void detail.refetch()}
          />
        ) : null}
        <TextField
          label={t('profiles.name', { defaultValue: 'Name' })}
          value={name}
          onChangeText={setName}
          editable={canSave}
        />
        <InlineTabBar
          value={type}
          tabs={['filament', 'print', 'printer'].map(key => ({
            key,
            label: key,
          }))}
          onChange={next => {
            if (!id || duplicate) setType(next);
          }}
        />
        <TextField
          label={t('profiles.baseId', { defaultValue: 'Base preset ID' })}
          value={baseId}
          onChangeText={setBaseId}
          autoCapitalize="none"
        />
        <ScrollView horizontal contentContainerStyle={styles.options}>
          {profiles
            .filter(
              row =>
                !isCustomCloudPreset(row) &&
                String(row.type).replace(/^process$/, 'print') === type &&
                String(row.setting_id) !== id,
            )
            .map(row => (
              <PrimaryButton
                key={String(row.setting_id)}
                label={String(row.name)}
                variant={baseId === row.setting_id ? 'primary' : 'secondary'}
                onPress={() => setBaseId(String(row.setting_id))}
              />
            ))}
        </ScrollView>
        {base.isError ? (
          <Text style={{ color: colors.error }}>
            {t('profiles.baseError', {
              defaultValue:
                'Unable to load base. Retry or select a different base.',
            })}
          </Text>
        ) : null}
        <InlineTabBar
          value={mode}
          tabs={[
            {
              key: 'fields',
              get label() { return translateNative('profiles.fields', { defaultValue: 'All fields' }); },
            },
            { key: 'json', label: 'JSON' },
            {
              key: 'diff',
              get label() { return translateNative('profiles.diff', { defaultValue: 'Compare to base' }); },
            },
            {
              key: 'templates',
              get label() { return translateNative('profiles.templates.title', {
                defaultValue: 'Templates',
              }); },
            },
          ]}
          onChange={switchMode}
        />
        <View style={styles.options}>
          <PrimaryButton
            label={t('profiles.importJson', { defaultValue: 'Import JSON' })}
            variant="secondary"
            disabled={!canSave}
            onPress={() =>
              void run(async () => {
                const value = await pickProfileJson();
                if (value) {
                  const imported =
                    value.setting &&
                    typeof value.setting === 'object' &&
                    !Array.isArray(value.setting)
                      ? (value.setting as Record<string, unknown>)
                      : value;
                  commitSettings({ ...settings, ...imported });
                }
              })
            }
          />
          <PrimaryButton
            label={t('profiles.exportJson', { defaultValue: 'Export JSON' })}
            variant="secondary"
            onPress={() =>
              void run(() =>
                shareProfileJson(
                  {
                    name,
                    type,
                    base_id: baseId,
                    setting: mode === 'json' ? parsePresetJson(raw) : settings,
                  },
                  name || 'preset',
                ),
              )
            }
          />
        </View>
        {mode === 'json' ? (
          <>
            <TextField
              label={t('profiles.rawJson', {
                defaultValue: 'Raw settings JSON',
              })}
              multiline
              value={raw}
              editable={canSave}
              onChangeText={value => {
                setRaw(value);
                try {
                  parsePresetJson(value);
                  setRawError('');
                } catch (error) {
                  setRawError(String(error));
                }
              }}
            />
            {rawError ? (
              <Text style={{ color: colors.error }}>{rawError}</Text>
            ) : null}
          </>
        ) : mode === 'templates' ? (
          <PresetTemplates
            type={type}
            settings={settings}
            onApply={(template, templateType) => {
              if (type !== templateType) {
                showToast(
                  nativeMessage('profiles.templateTypeMismatch', () => ({
                    defaultValue:
                      'Select a template matching this preset type.',
                  })),
                  'error',
                );
                return;
              }
              commitSettings({ ...settings, ...template });
              setMode('fields');
            }}
          />
        ) : (
          <>
            <TextField
              label={t('profiles.fieldSearch', {
                defaultValue: 'Search fields or values',
              })}
              value={search}
              onChangeText={setSearch}
            />
            {mode === 'fields' ? (
              <>
                <ScrollView horizontal contentContainerStyle={styles.options}>
                  {[
                    '',
                    ...new Set(
                      definitionList.map(field => field.category ?? 'custom'),
                    ),
                  ].map(key => (
                    <PrimaryButton
                      key={key}
                      label={
                        key ||
                        t('common.all', { defaultValue: 'All categories' })
                      }
                      variant={category === key ? 'primary' : 'secondary'}
                      onPress={() => setCategory(key)}
                    />
                  ))}
                </ScrollView>
                {allKeys
                  .filter(
                    key =>
                      (!category ||
                        (definitionMap.get(key)?.category ?? 'custom') ===
                          category) &&
                      `${key} ${JSON.stringify(
                        Object.hasOwn(settings, key)
                          ? settings[key]
                          : inherited[key],
                      )}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  )
                  .map(key => {
                    const value = Object.hasOwn(settings, key)
                      ? settings[key]
                      : inherited[key];
                    const field = definitionMap.get(key);
                    return (
                      <View key={key} style={styles.field}>
                        <Text selectable style={{ color: colors.text }}>
                          {key}
                          {Object.hasOwn(settings, key) ? ' *' : ''}
                        </Text>
                        {canSave ? (
                          <FieldEditor
                            field={field}
                            value={value}
                            onChange={next =>
                              commitSettings({ ...settings, [key]: next })
                            }
                            onValidation={error =>
                              setFieldErrors(current => {
                                const next = { ...current };
                                if (error) next[key] = error;
                                else delete next[key];
                                return next;
                              })
                            }
                          />
                        ) : (
                          <Text selectable style={{ color: colors.text }}>
                            {JSON.stringify(value)}
                          </Text>
                        )}
                        {Object.hasOwn(settings, key) && canSave ? (
                          <PrimaryButton
                            label={t('profiles.revert', {
                              defaultValue:
                                'Revert override / remove custom field',
                            })}
                            variant="secondary"
                            onPress={() => {
                              const next = { ...settings };
                              delete next[key];
                              commitSettings(next);
                              setFieldErrors(current => {
                                const errors = { ...current };
                                delete errors[key];
                                return errors;
                              });
                            }}
                          />
                        ) : null}
                      </View>
                    );
                  })}
                {canSave ? (
                  <>
                    <TextField
                      label={t('profiles.customKey', {
                        defaultValue: 'Custom field key',
                      })}
                      value={customKey}
                      onChangeText={setCustomKey}
                      autoCapitalize="none"
                    />
                    <InlineTabBar
                      value={customType}
                      tabs={['string', 'number', 'boolean', 'json'].map(
                        key => ({ key, label: key }),
                      )}
                      onChange={setCustomType}
                    />
                    <TextField
                      label={t('profiles.customValue', {
                        defaultValue: 'Custom value',
                      })}
                      value={customValue}
                      onChangeText={setCustomValue}
                    />
                    <PrimaryButton
                      label={t('profiles.addField', {
                        defaultValue: 'Add custom field',
                      })}
                      disabled={!customKey.trim()}
                      onPress={() => {
                        try {
                          const value: unknown =
                            customType === 'json'
                              ? JSON.parse(customValue)
                              : typedPresetValue(customValue, undefined, {
                                  key: customKey,
                                  type:
                                    customType === 'string'
                                      ? 'text'
                                      : customType,
                                });
                          commitSettings({
                            ...settings,
                            [customKey.trim()]: value,
                          });
                          setCustomKey('');
                          setCustomValue('');
                        } catch (error) {
                          showToast(String(error), 'error');
                        }
                      }}
                    />
                  </>
                ) : null}
              </>
            ) : (
              <>
                <PrimaryButton
                  label={
                    changedOnly
                      ? t('profiles.showAll', {
                          defaultValue: 'Show all fields',
                        })
                      : t('profiles.showChanged', {
                          defaultValue: 'Show changed fields only',
                        })
                  }
                  variant="secondary"
                  onPress={() => setChangedOnly(!changedOnly)}
                />
                {entries
                  .filter(
                    entry =>
                      (!changedOnly || entry.changed) &&
                      `${entry.key} ${JSON.stringify(
                        entry.value,
                      )} ${JSON.stringify(entry.inherited)}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  )
                  .map(entry => (
                    <View key={entry.key} style={styles.field}>
                      <Text selectable style={{ color: colors.text }}>
                        {entry.key} {entry.changed ? '≠' : '='}
                      </Text>
                      <Text selectable style={{ color: colors.textSecondary }}>
                        {t('profiles.baseValue', { defaultValue: 'Base' })}:{' '}
                        {JSON.stringify(entry.inherited)}
                      </Text>
                      <Text selectable style={{ color: colors.text }}>
                        {t('profiles.currentValue', {
                          defaultValue: 'Current',
                        })}
                        :{' '}
                        {JSON.stringify(
                          entry.override ? entry.value : entry.inherited,
                        )}
                      </Text>
                    </View>
                  ))}
              </>
            )}
          </>
        )}
        {Object.keys(fieldErrors).length ? (
          <Text style={{ color: colors.error }}>
            {t('profiles.invalidFields', {
              defaultValue: 'Invalid fields: {{fields}}',
              fields: Object.keys(fieldErrors).join(', '),
            })}
          </Text>
        ) : null}
        {canSave ? (
          <PrimaryButton
            label={t('common.save')}
            loading={mutation.isPending}
            disabled={
              mutation.isPending ||
              !!rawError ||
              Object.keys(fieldErrors).length > 0 ||
              detail.isError ||
              (!!id && !detail.data) ||
              !name.trim()
            }
            onPress={() => mutation.mutate('save')}
          />
        ) : null}
        {canEdit && id && !duplicate ? (
          <PrimaryButton
            label={t('common.delete')}
            variant="danger"
            disabled={mutation.isPending}
            onPress={() =>
              Alert.alert(
                t('profiles.delete', { defaultValue: 'Delete preset?' }),
                name,
                [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('common.delete'),
                    style: 'destructive',
                    onPress: () => mutation.mutate('delete'),
                  },
                ],
              )
            }
          />
        ) : null}
      </ScrollView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  modal: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  body: { gap: spacing.sm },
  field: { gap: spacing.xs, paddingVertical: spacing.sm },
  options: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
});
