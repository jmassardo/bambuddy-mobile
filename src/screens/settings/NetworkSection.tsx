import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { EmptyState, ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { PrimaryButton, SectionCard, StatusBadge, TextField } from '@/components/common/AppUI';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { pickBoolean, pickNumber, pickString, type ApiRecord } from '@/utils/data';
import IntegrationsSection from './IntegrationsSection';
import { SimpleModal, SwitchRow, settingsStyles as styles, stringifyNumberField } from './shared';
import { useSettingsDraft } from './useSettingsDraft';

type ExternalLinkFormState = {
  name: string;
  url: string;
  icon: string;
  open_in_new_tab: boolean;
  sort_order: string;
};

const EMPTY_EXTERNAL_LINK_FORM: ExternalLinkFormState = {
  name: '',
  url: '',
  icon: 'link',
  open_in_new_tab: true,
  sort_order: '0',
};

export default function NetworkSection() {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { canUpdateSettings, draft, saveSettingsMutation, setDraft, settingsQuery } = useSettingsDraft();
  const externalLinksQuery = useQuery({ queryKey: ['externalLinks'], queryFn: api.getExternalLinks });
  const [editingExternalLink, setEditingExternalLink] = useState<ApiRecord | null>(null);
  const [externalLinkModalVisible, setExternalLinkModalVisible] = useState(false);
  const [externalLinkForm, setExternalLinkForm] = useState<ExternalLinkFormState>(EMPTY_EXTERNAL_LINK_FORM);
  const [pendingDeleteExternalLink, setPendingDeleteExternalLink] = useState<ApiRecord | null>(null);

  const createExternalLinkMutation = useMutation({
    mutationFn: (payload: ExternalLinkFormState) => api.createExternalLink(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['externalLinks'] });
      closeExternalLinkModal();
      showToast('External link saved.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to save external link.', 'error'),
  });

  const updateExternalLinkMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ExternalLinkFormState }) => api.updateExternalLink(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['externalLinks'] });
      closeExternalLinkModal();
      showToast('External link updated.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to update external link.', 'error'),
  });

  const deleteExternalLinkMutation = useMutation({
    mutationFn: (id: number) => api.deleteExternalLink(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['externalLinks'] });
      setPendingDeleteExternalLink(null);
      showToast('External link removed.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to delete external link.', 'error'),
  });

  function closeExternalLinkModal() {
    setExternalLinkModalVisible(false);
    setEditingExternalLink(null);
    setExternalLinkForm(EMPTY_EXTERNAL_LINK_FORM);
  }

  function openExternalLinkModal(link?: ApiRecord) {
    if (link) {
      setEditingExternalLink(link);
      setExternalLinkForm({
        name: pickString(link, ['name']),
        url: pickString(link, ['url']),
        icon: pickString(link, ['icon'], 'link'),
        open_in_new_tab: pickBoolean(link, ['open_in_new_tab'], true),
        sort_order: String(pickNumber(link, ['sort_order'], 0)),
      });
    } else {
      setEditingExternalLink(null);
      setExternalLinkForm(EMPTY_EXTERNAL_LINK_FORM);
    }
    setExternalLinkModalVisible(true);
  }

  const handleSaveExternalLink = () => {
    if (!externalLinkForm.name.trim() || !externalLinkForm.url.trim()) {
      showToast('Name and URL are required.', 'error');
      return;
    }
    if (editingExternalLink) {
      updateExternalLinkMutation.mutate({
        id: pickNumber(editingExternalLink, ['id']),
        payload: externalLinkForm,
      });
      return;
    }
    createExternalLinkMutation.mutate(externalLinkForm);
  };

  if (settingsQuery.isLoading) {
    return <LoadingScreen message="Loading settings…" />;
  }

  if (settingsQuery.isError) {
    return <ErrorState message="Unable to load settings." onRetry={() => void settingsQuery.refetch()} />;
  }

  return (
    <>
      <SectionCard title="Network endpoints" subtitle="External URL plus retry and automation integrations.">
        <TextField label="External URL" value={pickString(draft, ['external_url'])} onChangeText={value => setDraft(current => ({ ...current, external_url: value }))} autoCapitalize="none" />
        <SwitchRow label="FTP retry enabled" value={pickBoolean(draft, ['ftp_retry_enabled'])} onValueChange={value => setDraft(current => ({ ...current, ftp_retry_enabled: value }))} />
        <TextField label="FTP retry count" value={stringifyNumberField(draft.ftp_retry_count, '0')} onChangeText={value => setDraft(current => ({ ...current, ftp_retry_count: Number(value) || 0 }))} keyboardType="number-pad" />
        <TextField label="FTP retry delay (s)" value={stringifyNumberField(draft.ftp_retry_delay, '0')} onChangeText={value => setDraft(current => ({ ...current, ftp_retry_delay: Number(value) || 0 }))} keyboardType="number-pad" />
      </SectionCard>
      <SectionCard title="External links" subtitle="Quick links for Grafana, Home Assistant, and other tools.">
        <PrimaryButton label="Add external link" variant="secondary" onPress={() => openExternalLinkModal()} />
        {((externalLinksQuery.data ?? []) as ApiRecord[]).length > 0 ? (
          ((externalLinksQuery.data ?? []) as ApiRecord[]).map(link => (
            <View key={pickString(link, ['id'])} style={[styles.itemCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
              <View style={styles.itemHeader}>
                <View style={styles.itemText}>
                  <Text style={[styles.itemTitle, { color: colors.text }]}>{pickString(link, ['name'], 'External link')}</Text>
                  <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>{pickString(link, ['url'])}</Text>
                </View>
                <StatusBadge label={pickBoolean(link, ['open_in_new_tab'], true) ? 'external' : 'embedded'} color={colors.accent} />
              </View>
              <View style={styles.actions}>
                <PrimaryButton label="Edit" variant="secondary" onPress={() => openExternalLinkModal(link)} />
                <PrimaryButton label="Delete" variant="danger" onPress={() => setPendingDeleteExternalLink(link)} />
              </View>
            </View>
          ))
        ) : (
          <EmptyState icon="🔗" title="No external links" message="Add Grafana, Home Assistant, or any other dashboard link." />
        )}
      </SectionCard>
      <IntegrationsSection draft={draft} setDraft={setDraft} />
      <PrimaryButton
        label={saveSettingsMutation.isPending ? 'Saving…' : 'Save settings'}
        onPress={() => void saveSettingsMutation.mutateAsync()}
        loading={saveSettingsMutation.isPending}
        disabled={!canUpdateSettings || saveSettingsMutation.isPending}
      />

      <SimpleModal
        visible={externalLinkModalVisible}
        title={editingExternalLink ? 'Edit external link' : 'Add external link'}
        subtitle="Name, destination URL, and whether it should open externally."
        onClose={closeExternalLinkModal}
      >
        <ScrollView contentContainerStyle={styles.modalBody}>
          <TextField label="Name" value={externalLinkForm.name} onChangeText={value => setExternalLinkForm(current => ({ ...current, name: value }))} />
          <TextField label="URL" value={externalLinkForm.url} onChangeText={value => setExternalLinkForm(current => ({ ...current, url: value }))} autoCapitalize="none" />
          <TextField label="Icon" value={externalLinkForm.icon} onChangeText={value => setExternalLinkForm(current => ({ ...current, icon: value }))} autoCapitalize="none" placeholder="link" />
          <SwitchRow label="Open in new tab" value={externalLinkForm.open_in_new_tab} onValueChange={value => setExternalLinkForm(current => ({ ...current, open_in_new_tab: value }))} />
          <TextField label="Sort order" value={externalLinkForm.sort_order} onChangeText={value => setExternalLinkForm(current => ({ ...current, sort_order: value }))} keyboardType="number-pad" />
          <View style={styles.modalFooter}>
            <PrimaryButton label="Cancel" variant="secondary" onPress={closeExternalLinkModal} />
            <PrimaryButton
              label={editingExternalLink ? (updateExternalLinkMutation.isPending ? 'Saving…' : 'Save link') : (createExternalLinkMutation.isPending ? 'Creating…' : 'Create link')}
              onPress={handleSaveExternalLink}
              loading={createExternalLinkMutation.isPending || updateExternalLinkMutation.isPending}
              disabled={createExternalLinkMutation.isPending || updateExternalLinkMutation.isPending}
            />
          </View>
        </ScrollView>
      </SimpleModal>

      <ConfirmModal
        visible={pendingDeleteExternalLink !== null}
        title="Delete external link"
        message={pendingDeleteExternalLink ? `Delete ${pickString(pendingDeleteExternalLink, ['name'], 'this link')}?` : 'Delete this external link?'}
        confirmLabel="Delete"
        onClose={() => setPendingDeleteExternalLink(null)}
        onConfirm={() => pendingDeleteExternalLink && void deleteExternalLinkMutation.mutateAsync(pickNumber(pendingDeleteExternalLink, ['id']))}
        loading={deleteExternalLinkMutation.isPending}
      />
    </>
  );
}
