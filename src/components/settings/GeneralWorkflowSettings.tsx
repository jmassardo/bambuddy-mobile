import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PrimaryButton, SectionCard } from '@/components/common/AppUI';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n';
import { workflowSettingsApi } from '@/api/workflowSettings';
import type { ArchiveRetentionSettings } from '@/types/api';
import { OptionChipsField, SwitchRow, settingsStyles } from './shared';
import { WorkflowNumberField } from './WorkflowFields';
import type { SettingsScreenController } from './useSettingsScreenController';

export function GeneralWorkflowSettings({
  controller,
}: {
  controller: SettingsScreenController;
}) {
  const { t } = useTranslation();
  const { authEnabled, hasPermission } = useAuth();
  const canPurge = !authEnabled || hasPermission('archives:purge');
  const queryClient = useQueryClient();
  const retention = useQuery({
    queryKey: ['archive-purge-settings'],
    queryFn: workflowSettingsApi.getArchiveRetention,
    enabled: canPurge,
  });
  const [retentionDraft, setRetentionDraft] =
    useState<ArchiveRetentionSettings | null>(null);
  useEffect(() => {
    if (retention.data) setRetentionDraft(retention.data);
  }, [retention.data]);
  const save = useMutation({
    mutationFn: workflowSettingsApi.saveArchiveRetention,
    onSuccess: data => {
      queryClient.setQueryData(['archive-purge-settings'], data);
      controller.actions.showToast(
        t('workflow.retentionSaved', {
          defaultValue: 'Archive retention saved.',
        }),
        'success',
      );
    },
  });
  const { draft } = controller.state;
  const set = (key: string, value: unknown) =>
    controller.actions.setDraft(current => ({ ...current, [key]: value }));
  return (
    <>
      {draft.capture_finish_photo === true ? (
        <SectionCard
          title={t('workflow.finishPhoto', { defaultValue: 'Finish photo' })}
        >
          <SwitchRow
            label={t('workflow.restorePlate', {
              defaultValue: 'Restore plate after finish photo',
            })}
            description={t('workflow.restorePlateHelp', {
              defaultValue:
                'Move the plate back after positioning it for the photo.',
            })}
            value={draft.finish_photo_restore_plate !== false}
            onValueChange={value => set('finish_photo_restore_plate', value)}
          />
        </SectionCard>
      ) : null}
      <SectionCard
        title={t('workflow.library', { defaultValue: 'Library policy' })}
      >
        <OptionChipsField
          label={t('workflow.libraryArchive', {
            defaultValue: 'Create archive when printing from library',
          })}
          value={String(draft.library_archive_mode ?? 'ask')}
          options={['always', 'never', 'ask'].map(key => ({
            key,
            label: t(`workflow.${key}`, { defaultValue: key }),
          }))}
          onChange={value => set('library_archive_mode', value)}
        />
        <WorkflowNumberField
          label={t('workflow.diskWarning', {
            defaultValue: 'Low disk warning (GB)',
          })}
          value={Number(draft.library_disk_warning_gb ?? 5)}
          min={0.5}
          max={100}
          integer={false}
          onChange={value => set('library_disk_warning_gb', value)}
        />
      </SectionCard>
      {canPurge ? (
        <SectionCard
          title={t('workflow.archiveRetention', {
            defaultValue: 'Automatic archive retention',
          })}
          subtitle={t('workflow.retentionWarning', {
            defaultValue:
              'Permanently removes old archive files. Statistics are preserved unless explicitly selected below.',
          })}
        >
          {retentionDraft ? (
            <>
              <SwitchRow
                label={t('workflow.autoPurge', {
                  defaultValue: 'Auto-purge old archives',
                })}
                value={retentionDraft.enabled}
                onValueChange={enabled =>
                  setRetentionDraft({ ...retentionDraft, enabled })
                }
              />
              <WorkflowNumberField
                label={t('workflow.retentionDays', {
                  defaultValue: 'Maximum archive age (days)',
                })}
                value={retentionDraft.days}
                min={7}
                max={3650}
                onChange={days =>
                  setRetentionDraft({ ...retentionDraft, days })
                }
              />
              <SwitchRow
                label={t('workflow.purgeStats', {
                  defaultValue: 'Also permanently delete statistics',
                })}
                value={retentionDraft.purge_stats}
                onValueChange={purge_stats =>
                  setRetentionDraft({ ...retentionDraft, purge_stats })
                }
              />
              <PrimaryButton
                label={t('workflow.saveRetention', {
                  defaultValue: 'Save archive retention',
                })}
                loading={save.isPending}
                disabled={save.isPending}
                onPress={() => save.mutate(retentionDraft)}
              />
            </>
          ) : (
            <Text
              style={[
                settingsStyles.helper,
                { color: controller.colors.textSecondary },
              ]}
            >
              {retention.isError
                ? t('workflow.retentionUnavailable', {
                    defaultValue: 'Unable to load archive retention.',
                  })
                : t('common.loading')}
            </Text>
          )}
          {save.error ? (
            <Text
              style={[
                settingsStyles.helper,
                { color: controller.colors.error },
              ]}
            >
              {save.error.message}
            </Text>
          ) : null}
          {retention.isError ? (
            <PrimaryButton
              label={t('common.retry', { defaultValue: 'Retry' })}
              onPress={() => void retention.refetch()}
            />
          ) : null}
        </SectionCard>
      ) : null}
    </>
  );
}
