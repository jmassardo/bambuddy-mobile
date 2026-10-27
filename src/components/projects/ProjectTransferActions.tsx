import React from 'react';
import { View, StyleSheet } from 'react-native';
import { errorCodes, isErrorWithCode, pick, types } from '@react-native-documents/picker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/api/projects';
import { PrimaryButton } from '@/components/common/AppUI';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTranslation } from '@/i18n';
import { spacing } from '@/theme/tokens';
import { shareBlob } from '@/utils/share';

async function readDocument(uri: string, errorMessage: string) {
  const response = await fetch(uri);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(errorMessage));
    reader.readAsText(blob);
  });
}

export async function importProjectDocument(
  file: { uri: string; name: string | null; type: string | null },
  messages = { readError: 'Unable to read project document.', invalidJson: 'Invalid project JSON: each project must have a name.' },
) {
  if (file.name?.toLowerCase().endsWith('.zip')) {
    return projectsApi.importProjectFile({ uri: file.uri, name: file.name, type: file.type || 'application/zip' });
  }
  const parsed: unknown = JSON.parse(await readDocument(file.uri, messages.readError));
  const projects = Array.isArray(parsed) ? parsed : [parsed];
  for (const project of projects) {
    if (!project || typeof project !== 'object' || Array.isArray(project) || typeof project.name !== 'string') {
      throw new Error(messages.invalidJson);
    }
  }
  for (const project of projects) await projectsApi.importProject(project as Record<string, unknown>);
}

export function ProjectTransferActions({ projectId }: { projectId?: number }) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const transfer = useMutation({
    mutationFn: async (action: 'import' | 'export') => {
      if (action === 'import') {
        const [file] = await pick({ type: [types.allFiles] });
        if (!file.name || !/\.(zip|json)$/i.test(file.name)) throw new Error(t('projects.unsupportedPackage', { defaultValue: 'Choose a .zip or .json project package.' }));
        await importProjectDocument(file, {
          readError: t('projects.readError', { defaultValue: 'Unable to read project document.' }),
          invalidJson: t('projects.invalidJson', { defaultValue: 'Invalid project JSON: each project must have a name.' }),
        });
      } else if (projectId !== undefined) {
        await shareBlob(await projectsApi.exportProjectZip(projectId), `project_${projectId}.zip`);
      } else {
        const projects = await projectsApi.getProjects();
        const exports = [];
        for (const project of projects) exports.push(await projectsApi.exportProjectJson(project.id));
        await shareBlob(new Blob([JSON.stringify(exports, null, 2)], { type: 'application/json', lastModified: Date.now() }), 'bambuddy_projects.json');
      }
    },
    onSuccess: () => showToast(t('projects.transferSuccess', { defaultValue: 'Project transfer completed.' }), 'success'),
    onError: (error: unknown) => {
      if (isErrorWithCode(error) && error.code === errorCodes.OPERATION_CANCELED) return;
      showToast(error instanceof Error ? error.message : t('projects.transferError', { defaultValue: 'Project transfer failed.' }), 'error');
    },
    onSettled: async () => { await queryClient.invalidateQueries({ queryKey: ['projects'] }); },
  });
  return (
    <View style={styles.actions}>
      {projectId === undefined && hasPermission('projects:create') ? <PrimaryButton
        label={t('projects.import', { defaultValue: 'Import project package' })} variant="secondary"
        disabled={transfer.isPending} loading={transfer.isPending && transfer.variables === 'import'}
        onPress={() => transfer.mutate('import')} /> : null}
      {hasPermission('projects:read') ? <PrimaryButton
        label={projectId === undefined ? t('projects.exportAll', { defaultValue: 'Export all projects' }) : t('projects.export', { defaultValue: 'Export project' })}
        variant="secondary" disabled={transfer.isPending} loading={transfer.isPending && transfer.variables === 'export'}
        onPress={() => transfer.mutate('export')} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
