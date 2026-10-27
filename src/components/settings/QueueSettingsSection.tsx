import React from 'react';
import { SectionCard, TextField } from '@/components/common/AppUI';
import { SwitchRow, stringifyNumberField } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';
import { PrintDefaultsSettings } from './PrintDefaultsSettings';
import { QueueWorkflowSettings } from './QueueWorkflowSettings';
import { WorkflowNumberField } from './WorkflowFields';
import { useTranslation } from '@/i18n';
import { SlicerSetupSection, type SlicerSetupValues } from '@/components/slicing/SlicerSetupSection';

export function QueueSettingsSection({
  controller,
}: {
  controller: SettingsScreenController;
}) {
  const { t } = useTranslation();
  const { draft } = controller.state;
  const { setDraft } = controller.actions;

  return (
    <>
      <PrintDefaultsSettings controller={controller} />
      <SectionCard
        title="Dispatch behavior"
        subtitle={t('workflow.dispatchHelp', {
          defaultValue:
            'Queue ordering, preheat, plate confirmation, and staggering. Concurrent uploads use one connection and one host thread per printer.',
        })}
      >
        <SwitchRow
          label="Shortest job first"
          value={Boolean(draft.queue_shortest_first)}
          onValueChange={value =>
            setDraft(current => ({ ...current, queue_shortest_first: value }))
          }
        />
        <SwitchRow
          label="Require plate clear confirmation"
          value={Boolean(draft.require_plate_clear)}
          onValueChange={value =>
            setDraft(current => ({ ...current, require_plate_clear: value }))
          }
        />
        <SwitchRow
          label="Preheat before queued prints"
          value={Boolean(draft.preheat_enabled)}
          onValueChange={value =>
            setDraft(current => ({ ...current, preheat_enabled: value }))
          }
        />
        <WorkflowNumberField
          label={t('workflow.concurrentUploads', {
            defaultValue: 'Maximum concurrent queue uploads (1–16)',
          })}
          value={Number(draft.queue_max_concurrent_uploads ?? 4)}
          min={1}
          max={16}
          onChange={value =>
            setDraft(current => ({
              ...current,
              queue_max_concurrent_uploads: value,
            }))
          }
        />
        <TextField
          label="Stagger group size"
          value={stringifyNumberField(draft.stagger_group_size, '1')}
          onChangeText={value =>
            setDraft(current => ({
              ...current,
              stagger_group_size: Number(value) || 1,
            }))
          }
          keyboardType="number-pad"
        />
        <TextField
          label="Stagger interval (minutes)"
          value={stringifyNumberField(draft.stagger_interval_minutes, '0')}
          onChangeText={value =>
            setDraft(current => ({
              ...current,
              stagger_interval_minutes: Number(value) || 0,
            }))
          }
          keyboardType="number-pad"
        />
        <WorkflowNumberField
          label={t('workflow.preheatWait', {
            defaultValue: 'Preheat max wait (seconds)',
          })}
          value={Number(draft.preheat_max_wait_seconds ?? 900)}
          min={60}
          max={3600}
          onChange={value =>
            setDraft(current => ({
              ...current,
              preheat_max_wait_seconds: value,
            }))
          }
        />
        <WorkflowNumberField
          label={t('workflow.preheatSoak', {
            defaultValue: 'Preheat soak (seconds)',
          })}
          value={Number(draft.preheat_soak_seconds ?? 300)}
          min={0}
          max={1800}
          onChange={value =>
            setDraft(current => ({ ...current, preheat_soak_seconds: value }))
          }
        />
        <TextField
          label="Max pipeline copies"
          value={stringifyNumberField(draft.pipeline_max_copies, '1')}
          onChangeText={value =>
            setDraft(current => ({
              ...current,
              pipeline_max_copies: Number(value) || 1,
            }))
          }
          keyboardType="number-pad"
        />
      </SectionCard>
      <SlicerSetupSection
        value={{
          preferred_slicer: String(draft.preferred_slicer ?? 'bambu_studio') as SlicerSetupValues['preferred_slicer'],
          use_slicer_api: Boolean(draft.use_slicer_api),
          bambu_studio_api_url: String(draft.bambu_studio_api_url ?? ''),
          orcaslicer_api_url: String(draft.orcaslicer_api_url ?? ''),
          slicer_stall_timeout_minutes: Number(draft.slicer_stall_timeout_minutes ?? 15),
        }}
        onChange={patch => setDraft(current => ({ ...current, ...patch }))}
        disabled={!controller.permissions.canUpdateSettings}
      />
      <QueueWorkflowSettings controller={controller} />
    </>
  );
}
