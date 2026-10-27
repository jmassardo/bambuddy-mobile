import React from 'react';
import { SectionCard, TextField } from '@/components/common/AppUI';
import { OptionChipsField, SwitchRow, stringifyNumberField } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';
import { LocalBackupTools } from './LocalBackupTools';
import { RemoteBackupSettings } from './RemoteBackupSettings';
import { useTranslation } from '@/i18n';
import { useAuth } from '@/contexts/AuthContext';

export function BackupSettingsSection({
  controller,
}: {
  controller: SettingsScreenController;
}) {
  const { draft } = controller.state;
  const { setDraft } = controller.actions;
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canUpdate = hasPermission('settings:update');

  return (
    <>
      {hasPermission('settings:backup') || hasPermission('settings:restore') ? (
        <SectionCard
          title={t('backup.local.title', { defaultValue: 'Local backups' })}
          subtitle={t('backup.local.subtitle', {
            defaultValue: 'Schedule, retention, and ad-hoc backup actions.',
          })}
        >
          {hasPermission('settings:read') ? (
            <>
              <SwitchRow
                disabled={!canUpdate}
                label={t('backup.local.enabled', {
                  defaultValue: 'Scheduled local backup enabled',
                })}
                value={Boolean(draft.local_backup_enabled)}
                onValueChange={value =>
                  setDraft(current => ({
                    ...current,
                    local_backup_enabled: value,
                  }))
                }
              />
              <OptionChipsField
                disabled={!canUpdate}
                label={t('backup.local.schedule', { defaultValue: 'Schedule' })}
                value={String(draft.local_backup_schedule ?? 'daily')}
                options={['hourly', 'daily', 'weekly'].map(key => ({
                  key,
                  label: t(`backup.local.schedule.${key}`, {
                    defaultValue: key,
                  }),
                }))}
                onChange={value =>
                  setDraft(current => ({
                    ...current,
                    local_backup_schedule: value,
                  }))
                }
              />
              {draft.local_backup_schedule !== 'hourly' ? (
                <TextField
                  editable={canUpdate}
                  label={t('backup.local.time', {
                    defaultValue: 'Run time (HH:MM, server timezone)',
                  })}
                  value={String(draft.local_backup_time ?? '03:00')}
                  onChangeText={value =>
                    setDraft(current => ({
                      ...current,
                      local_backup_time: value,
                    }))
                  }
                  error={
                    /^([01]\d|2[0-3]):[0-5]\d$/.test(
                      String(draft.local_backup_time ?? '03:00'),
                    )
                      ? undefined
                      : t('backup.local.invalidTime', {
                          defaultValue: 'Enter a valid 24-hour time.',
                        })
                  }
                />
              ) : null}
              <TextField
                editable={canUpdate}
                label={t('backup.local.retention', {
                  defaultValue: 'Retention (1–100 backups)',
                })}
                value={stringifyNumberField(draft.local_backup_retention, '5')}
                onChangeText={value =>
                  setDraft(current => ({
                    ...current,
                    local_backup_retention: value,
                  }))
                }
                keyboardType="number-pad"
                error={
                  Number(draft.local_backup_retention ?? 5) >= 1 &&
                  Number(draft.local_backup_retention ?? 5) <= 100 &&
                  Number.isInteger(Number(draft.local_backup_retention ?? 5))
                    ? undefined
                    : t('backup.local.invalidRetention', {
                        defaultValue:
                          'Choose a whole number between 1 and 100.',
                      })
                }
              />
              <TextField
                editable={canUpdate}
                label={t('backup.local.path', { defaultValue: 'Backup path' })}
                value={String(draft.local_backup_path ?? '')}
                onChangeText={value =>
                  setDraft(current => ({
                    ...current,
                    local_backup_path: value,
                  }))
                }
                autoCapitalize="none"
              />
            </>
          ) : null}
          <LocalBackupTools />
        </SectionCard>
      ) : null}
      {hasPermission('github:backup') || hasPermission('github:restore') ? (
        <RemoteBackupSettings />
      ) : null}
    </>
  );
}
