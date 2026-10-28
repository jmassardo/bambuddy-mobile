import { useLocalizedMemo, useNativeLocale, useTranslation } from '@/i18n';
import React, { useEffect, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { projectsApi } from '@/api/projects';
import { PrimaryButton, SearchBar } from '@/components/common/AppUI';
import { ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { SliceModal } from '@/components/files/SliceModal';
import { RunWithPipelineModal } from '@/components/slicing/RunWithPipelineModal';
import { PrintModal } from '@/components/printers/PrintModal';
import { useAuth } from '@/contexts/AuthContext';

import { useTheme } from '@/theme';
import { borderRadius, spacing } from '@/theme/tokens';
import type { SliceSourceProps } from '@/types/api';
import { pickNumber, pickString, type ApiRecord } from '@/utils/data';
import { isPrintableProjectFile } from '@/utils/projectHierarchy';

interface ProjectActionProps {
  visible: boolean;
  onClose: () => void;
  projectId: number;
  projectName: string;
}

function ProjectSourceAction({ action, visible, onClose, projectId, projectName }: ProjectActionProps & { action: 'slice' | 'pipeline' | 'print' }) {
  useNativeLocale();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { hasPermission } = useAuth();
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<SliceSourceProps | null>(null);
  const [ready, setReady] = useState(false);
  const canReadLibrary = hasPermission('library:read') || hasPermission('library:read_own') || hasPermission('library:read_all');
  const files = useQuery({
    queryKey: ['projectFiles', projectId],
    queryFn: () => api.getLibraryFiles(undefined, false, projectId),
    enabled: visible && canReadLibrary,
  });
  const archives = useQuery({
    queryKey: ['projectActionArchives', projectId],
    queryFn: () => projectsApi.getAllProjectArchives(projectId),
    enabled: visible,
  });
  useEffect(() => { setSource(null); setReady(false); setSearch(''); }, [visible, projectId, action]);
  const sources = useLocalizedMemo(() => {
    const librarySources = ((files.data ?? []) as ApiRecord[])
      .filter(file => action === 'print' ? isPrintableProjectFile(file) : /\.(stl|3mf)$/i.test(pickString(file, ['filename'])))
      .map(file => ({ sourceType: 'file' as const, sourceId: pickNumber(file, ['id']), sourceName: pickString(file, ['print_name', 'filename']) }));
    const archiveSources = ((archives.data ?? []) as ApiRecord[])
      .filter(archive => action === 'print' || /\.(stl|3mf)$/i.test(pickString(archive, ['filename'])))
      .map(archive => ({ sourceType: 'archive' as const, sourceId: pickNumber(archive, ['id']), sourceName: pickString(archive, ['print_name', 'filename']) }));
    return [...librarySources, ...archiveSources];
  }, [files.data, archives.data, action]);
  const refreshProject = () => {
    for (const key of ['project', 'projectArchives', 'projectTimeline', 'projectFiles']) {
      void client.invalidateQueries({ queryKey: [key, projectId] });
    }
  };
  const close = () => { setSource(null); setReady(false); onClose(); };
  const title = action === 'print'
    ? t('projects.printSource', { defaultValue: 'Choose a sliced project file or archive to print' })
    : t('projects.modelSource', { defaultValue: 'Choose a project STL or 3MF source' });
  return <>
    <Modal visible={visible && source === null} transparent animationType="slide" onRequestClose={close}
      onDismiss={() => { if (source) setReady(true); }}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={{ color: colors.textSecondary }}>{projectName}</Text>
          <SearchBar value={search} onChangeText={setSearch} placeholder={t('projects.searchSources', { defaultValue: 'Search project sources' })} />
          {files.isError ? <ErrorState message={t('projects.fileSourceError', { defaultValue: 'Unable to load linked files.' })} onRetry={() => void files.refetch()} /> : null}
          {archives.isError ? <ErrorState message={t('projects.archiveSourceError', { defaultValue: 'Unable to load project archives.' })} onRetry={() => void archives.refetch()} /> : null}
          <ScrollView contentContainerStyle={styles.sources}>
            {sources.filter(item => item.sourceName.toLowerCase().includes(search.toLowerCase())).map(item => <PrimaryButton
              key={`${item.sourceType}-${item.sourceId}`} variant="secondary"
              label={item.sourceType === 'file'
                ? t('projects.librarySource', { defaultValue: 'Library: {{name}}', name: item.sourceName })
                : t('projects.archiveSource', { defaultValue: 'Archive: {{name}}', name: item.sourceName })}
              onPress={() => {
                setSource(item);
                // iOS must finish dismissing the picker before presenting another native modal.
                if (Platform.OS !== 'ios') setReady(true);
              }} />)}
            {files.isLoading || archives.isLoading ? <LoadingScreen message={t('projects.loadingSources', { defaultValue: 'Loading project sources…' })} /> : null}
            {!sources.length && !files.isLoading && !archives.isLoading ? <Text style={{ color: colors.textSecondary }}>{t('projects.noSources', { defaultValue: 'No eligible sources. Link a library folder or add a printed archive to this project first.' })}</Text> : null}
          </ScrollView>
          <PrimaryButton label={t('common.cancel')} variant="secondary" onPress={close} />
        </View>
      </View>
    </Modal>
    {visible && ready && source ? action === 'pipeline'
      ? <RunWithPipelineModal visible {...source} onClose={close} onRunStarted={refreshProject} />
      : action === 'slice'
        ? <SliceModal visible {...source} onClose={close} />
        : <PrintModal visible onClose={close} initialFileId={source.sourceType === 'file' ? source.sourceId : undefined}
          initialArchiveId={source.sourceType === 'archive' ? source.sourceId : undefined}
          initialMode="queue" projectId={projectId} onSuccess={refreshProject} />
      : null}
  </>;
}

export function ProjectPipelineModal(props: ProjectActionProps) {
  useNativeLocale();
  return <ProjectSourceAction key={props.projectId} {...props} action="pipeline" />;
}

export function ProjectSliceModal(props: ProjectActionProps) {
  useNativeLocale();
  return <ProjectSourceAction key={props.projectId} {...props} action="slice" />;
}

export function ProjectBatchPrintModal(props: ProjectActionProps) {
  useNativeLocale();
  return <ProjectSourceAction key={props.projectId} {...props} action="print" />;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', padding: spacing.lg },
  card: { maxHeight: '90%', borderRadius: borderRadius.xl, padding: spacing.lg, gap: spacing.sm },
  title: { fontWeight: '600' },
  sources: { gap: spacing.sm },
});
