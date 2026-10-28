import { NativeTranslation, nativeMessage, translateNative, useLocalizedMemo, useNativeLocale, useTranslation } from '@/i18n';

import { localizedStatus } from '@/utils/statusLabel';

import React, { useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RootNavigationProp, RootRouteProp } from '@/navigation/types';
import {
  Image,
  Alert,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { projectsApi } from '@/api/projects';
import { RichProjectNotes } from '@/components/projects/RichProjectNotes';
import { ProjectHierarchySummary } from '@/components/projects/ProjectHierarchySummary';
import { ProjectTransferActions } from '@/components/projects/ProjectTransferActions';
import { completeProjectSets, isPrintableProjectFile } from '@/utils/projectHierarchy';
import { openLibrary } from '@/utils/libraryNavigation';

import { EmptyState, ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { InlineTabBar, PrimaryButton, ProgressBar, SectionCard, StatCard, StatusBadge, TextField } from '@/components/common/AppUI';
import {
  ProjectBatchPrintModal,
  ProjectPipelineModal,
  ProjectSliceModal,
} from '@/components/projects/ProjectActionModals';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { formatCurrency, formatDate, formatDateTime, formatDuration, formatWeight, pickBoolean, pickNumber, pickString, statusColor, type ApiRecord } from '@/utils/data';

type DetailTab = 'summary' | 'bom' | 'files' | 'timeline' | 'archives';

const DEFAULT_BOM = { name: '', quantity: '1', price: '', url: '', remarks: '' };

function isProjectModelFile(file: ApiRecord) {
  const filename = pickString(file, ['filename', 'name']);
  return /\.(stl|3mf)$/i.test(filename) && !/\.gcode(\.3mf)?$/i.test(filename);
}

export default function ProjectDetailScreen() {
  const titleLocale = useNativeLocale();
  const { t } = useTranslation();
  const navigation = useNavigation<RootNavigationProp<'ProjectDetail'>>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: translateNative('screen.project') });
  }, [navigation, titleLocale]);

  const route = useRoute<RootRouteProp<'ProjectDetail'>>();
  const projectId = Number(route.params?.id);
  const { colors } = useTheme();
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<DetailTab>('summary');
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [showBomModal, setShowBomModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showPipelineModal, setShowPipelineModal] = useState(false);
  const [showSliceModal, setShowSliceModal] = useState(false);
  const [editingBom, setEditingBom] = useState<ApiRecord | null>(null);
  const [bomForm, setBomForm] = useState(DEFAULT_BOM);
  const [hideCompletedBom, setHideCompletedBom] = useState(false);

  const projectQuery = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.getProject(projectId),
    enabled: Number.isFinite(projectId),
  });
  const archivesQuery = useQuery({
    queryKey: ['projectArchives', projectId],
    queryFn: () => api.getProjectArchives(projectId),
    enabled: Number.isFinite(projectId),
  });
  const bomQuery = useQuery({
    queryKey: ['projectBOM', projectId],
    queryFn: () => api.getProjectBOM(projectId),
    enabled: Number.isFinite(projectId),
  });
  const timelineQuery = useQuery({
    queryKey: ['projectTimeline', projectId],
    queryFn: () => api.getProjectTimeline(projectId, 20),
    enabled: Number.isFinite(projectId),
  });
  const linkedFoldersQuery = useQuery({
    queryKey: ['projectFolders', projectId],
    queryFn: () => api.getLibraryFoldersByProject(projectId),
    enabled: Number.isFinite(projectId),
  });
  const projectFilesQuery = useQuery({
    queryKey: ['projectFiles', projectId],
    queryFn: () => api.getLibraryFiles(undefined, false, projectId),
    enabled: Number.isFinite(projectId),
  });
  const fileProgressQuery = useQuery({
    queryKey: ['projectFileProgress', projectId],
    queryFn: () => projectsApi.getProjectFileProgress(projectId),
    enabled: Number.isFinite(projectId),
  });
  const templateMutation = useMutation({
    mutationFn: () => projectsApi.createTemplateFromProject(projectId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      await queryClient.invalidateQueries({ queryKey: ['projectTemplates'] });
      showToast(nativeMessage('projects.templateSaved', () => ({ defaultValue: 'Project saved as template.' })), 'success');
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });

  const refreshAll = async () => {
    await Promise.all([
      projectQuery.refetch(),
      archivesQuery.refetch(),
      bomQuery.refetch(),
      timelineQuery.refetch(),
      linkedFoldersQuery.refetch(),
      projectFilesQuery.refetch(),
      fileProgressQuery.refetch(),
    ]);
  };

  const updateProjectMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.updateProject(projectId, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      setEditingNotes(false);
      showToast(nativeMessage('native.ad41c4498a8814e8'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.d7fb3bf7219f6906'), 'error'),
  });

  const createBomMutation = useMutation({
    mutationFn: () =>
      api.createBOMItem(projectId, {
        name: bomForm.name.trim(),
        quantity_needed: Number(bomForm.quantity) || 1,
        unit_price: bomForm.price ? Number(bomForm.price) : undefined,
        sourcing_url: bomForm.url.trim() || undefined,
        remarks: bomForm.remarks.trim() || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projectBOM', projectId] });
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setShowBomModal(false);
      setEditingBom(null);
      setBomForm(DEFAULT_BOM);
      showToast(nativeMessage('native.bb1279768a3c155a'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.ed5114b3fbdbf493'), 'error'),
  });

  const updateBomMutation = useMutation({
    mutationFn: () =>
      api.updateBOMItem(projectId, pickNumber(editingBom, ['id']), {
        name: bomForm.name.trim(),
        quantity_needed: Number(bomForm.quantity) || 1,
        unit_price: bomForm.price ? Number(bomForm.price) : undefined,
        sourcing_url: bomForm.url.trim() || undefined,
        remarks: bomForm.remarks.trim() || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projectBOM', projectId] });
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setShowBomModal(false);
      setEditingBom(null);
      setBomForm(DEFAULT_BOM);
      showToast(nativeMessage('native.7e9becfb0c1bbd28'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.7308072b0d57cb64'), 'error'),
  });

  const toggleBomMutation = useMutation({
    mutationFn: ({ itemId, quantityAcquired }: { itemId: number; quantityAcquired: number }) =>
      api.updateBOMItem(projectId, itemId, { quantity_acquired: quantityAcquired }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projectBOM', projectId] });
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      showToast(nativeMessage('native.7e9becfb0c1bbd28'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.7308072b0d57cb64'), 'error'),
  });

  const deleteBomMutation = useMutation({
    mutationFn: (itemId: number) => api.deleteBOMItem(projectId, itemId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projectBOM', projectId] });
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      showToast(nativeMessage('native.1ab1fe70a69212c1'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.0254a5aa91f01964'), 'error'),
  });

  const project = (projectQuery.data ?? null) as ApiRecord | null;
  const archives = useLocalizedMemo(() => ((archivesQuery.data ?? []) as ApiRecord[]), [archivesQuery.data]);
  const bomItems = useLocalizedMemo(() => ((bomQuery.data ?? []) as ApiRecord[]), [bomQuery.data]);
  const timeline = useLocalizedMemo(() => ((timelineQuery.data ?? []) as ApiRecord[]), [timelineQuery.data]);
  const linkedFolders = useLocalizedMemo(() => ((linkedFoldersQuery.data ?? []) as ApiRecord[]), [linkedFoldersQuery.data]);
  const projectFiles = useLocalizedMemo(() => ((projectFilesQuery.data ?? []) as ApiRecord[]), [projectFilesQuery.data]);
  const modelFiles = useLocalizedMemo(
    () => projectFiles.filter(isProjectModelFile),
    [projectFiles],
  );

  const filesByFolder = useLocalizedMemo(() => {
    const map = new Map<number, ApiRecord[]>();
    projectFiles.forEach(file => {
      const folderId = pickNumber(file, ['folder_id'], -1);
      if (folderId < 0) return;
      map.set(folderId, [...(map.get(folderId) ?? []), file]);
    });
    return map;
  }, [projectFiles]);

  const stats = (project?.stats ?? {}) as ApiRecord;
  const visibleBomItems = hideCompletedBom ? bomItems.filter(item => !pickBoolean(item, ['is_complete'])) : bomItems;
  const completeSets = completeProjectSets(projectFiles, fileProgressQuery.data ?? [], pickNumber(project, ['target_sets']));
  const progressByFileId = new Map((fileProgressQuery.data ?? []).map(row => [row.file_id, row.completed_count]));

  React.useEffect(() => {
    if (project && !editingNotes) {
      setNotes(pickString(project, ['notes']));
    }
  }, [editingNotes, project]);

  if (projectQuery.isLoading) {
    return <LoadingScreen message={translateNative('native.358e6e595e606f1d')} />;
  }

  if (projectQuery.isError || !project) {
    return (
      <ErrorState
        message={translateNative('native.83797b0d58240286')}
        onRetry={() => void refreshAll()}
      />
    );
  }

  const status = pickString(project, ['status'], 'active');
  const priority = pickString(project, ['priority'], 'normal');
  const progress = pickNumber(stats, ['progress_percent'], 0);
  const partsProgress = pickNumber(stats, ['parts_progress_percent'], 0);
  const budget = pickNumber(project, ['budget'], 0);
  const totalCost = pickNumber(stats, ['estimated_cost'], 0) + pickNumber(stats, ['total_energy_cost'], 0) + pickNumber(stats, ['bom_cost'], 0);

  const openBomModal = (item?: ApiRecord) => {
    setEditingBom(item ?? null);
    setBomForm(item ? {
      name: pickString(item, ['name']),
      quantity: pickString(item, ['quantity_needed'], '1'),
      price: pickString(item, ['unit_price']),
      url: pickString(item, ['sourcing_url']),
      remarks: pickString(item, ['remarks']),
    } : DEFAULT_BOM);
    setShowBomModal(true);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={
            projectQuery.isRefetching ||
            archivesQuery.isRefetching ||
            bomQuery.isRefetching ||
            timelineQuery.isRefetching ||
            projectFilesQuery.isRefetching
          }
          onRefresh={() => void refreshAll()}
          tintColor={colors.accent}
        />
      }
    >
      <SectionCard
        title={pickString(project, ['name'], translateNative('native.54c922b0b8543c9f'))}
        subtitle={pickString(project, ['description'], translateNative('native.1a05db3e8ac8888f'))}
        right={<StatusBadge label={localizedStatus(status)} color={statusColor(status, colors)} />}
      >
        <View style={styles.summaryBadges}>
          <StatusBadge label={localizedStatus(priority)} color={statusColor(priority, colors)} />
          {pickString(project, ['due_date']) ? (
            <StatusBadge label={translateNative('native.c1ec6dade2c64551', { value0: String(formatDate(pickString(project, ['due_date']))) })} color={colors.warning} />
          ) : null}
        </View>
        <View style={styles.summaryGrid}>
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{t('projects.ownTotals', { defaultValue: 'This project only (excludes descendants)' })}</Text>
          <StatCard label={translateNative('native.07f0e244315da025')} value={String(pickNumber(stats, ['total_archives'], archives.length))} />
          <StatCard label={translateNative('native.e3f6c45e9f8c8d80')} value={formatDuration(pickNumber(stats, ['total_print_time_hours'], 0) * 3600)} />
          <StatCard label={translateNative('native.12e2b8020ce55e27')} value={formatWeight(pickNumber(stats, ['total_filament_grams'], 0))} />
          <StatCard label={translateNative('native.ed03ab70dd938c3b')} value={budget > 0 ? formatCurrency(budget) : '—'} />
        </View>
        <View style={styles.progressSection}>
          <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>{translateNative('native.d9361cc4a01bd006')}</Text>
          <ProgressBar progress={progress} color={colors.accent} trackColor={colors.surfaceElevated} />
          <Text style={[styles.progressMeta, { color: colors.textSecondary }]}><NativeTranslation id="native.349cf64bc644c0ba" values={{ value0: (Math.round(progress)), value1: (pickNumber(stats, ['remaining_prints'], 0)) }} /></Text>
          <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>{translateNative('native.20dbbe044f6dc8e7')}</Text>
          <ProgressBar progress={partsProgress} color={colors.info} trackColor={colors.surfaceElevated} />
          <Text style={[styles.progressMeta, { color: colors.textSecondary }]}><NativeTranslation id="native.349cf64bc644c0ba" values={{ value0: (Math.round(partsProgress)), value1: (pickNumber(stats, ['remaining_parts'], 0)) }} /></Text>
        </View>
        <View style={styles.actions}>
          <ProjectTransferActions projectId={projectId} />
          {hasPermission('projects:create') && !pickBoolean(project, ['is_template']) ? <PrimaryButton
            label={t('projects.saveTemplate', { defaultValue: 'Save as template' })} variant="secondary"
            disabled={templateMutation.isPending} loading={templateMutation.isPending}
            onPress={() => templateMutation.mutate()} /> : null}
          {hasPermission('queue:create') ? <PrimaryButton label={t('projects.batchPrint', { defaultValue: 'Batch Print' })} variant="secondary" onPress={() => setShowBatchModal(true)} /> : null}
          {hasPermission('pipelines:read') && hasPermission('pipelines:run') ? <PrimaryButton label={t('projects.runPipeline', { defaultValue: 'Run Pipeline' })} variant="secondary" onPress={() => setShowPipelineModal(true)} /> : null}
          {hasPermission('library:upload') ? <PrimaryButton label={t('projects.slice', { defaultValue: 'Slice' })} variant="secondary" onPress={() => setShowSliceModal(true)} /> : null}
          {pickString(project, ['url']) ? (
            <PrimaryButton label={translateNative('native.57618ab115058580')} variant="secondary" onPress={() => void Linking.openURL(pickString(project, ['url']))} />
          ) : null}
          {hasPermission('projects:update') ? (
            <PrimaryButton
              label={editingNotes ? (updateProjectMutation.isPending ? translateNative('native.018c2002806e2312') : translateNative('native.c2e02749c2a09d0a')) : translateNative('native.fc9272e6547154b5')}
              variant="secondary"
              onPress={() => {
                if (editingNotes) {
                  void updateProjectMutation.mutateAsync({ notes });
                } else {
                  setEditingNotes(true);
                }
              }}
              disabled={updateProjectMutation.isPending}
            />
          ) : null}
        </View>
      </SectionCard>
      <ProjectHierarchySummary project={project} onOpen={id => navigation.push('ProjectDetail', { id })} />
      {pickNumber(project, ['target_sets']) > 0 ? <SectionCard title={t('projects.completeSets', { defaultValue: 'Complete sets' })}>
        {fileProgressQuery.isError || projectFilesQuery.isError ? <ErrorState message={t('projects.progressError', { defaultValue: 'Unable to load production progress.' })} onRetry={() => { void fileProgressQuery.refetch(); void projectFilesQuery.refetch(); }} /> : fileProgressQuery.isLoading || projectFilesQuery.isLoading ? <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{t('projects.loadingProgress', { defaultValue: 'Loading production progress…' })}</Text> : <>
          <Text style={[styles.bodyText, { color: colors.text }]}>{t('projects.setsCount', { defaultValue: '{{done}} / {{target}} complete sets · {{remaining}} remaining', done: completeSets ?? 0, target: pickNumber(project, ['target_sets']), remaining: Math.max(0, pickNumber(project, ['target_sets']) - (completeSets ?? 0)) })}</Text>
          <ProgressBar progress={((completeSets ?? 0) / pickNumber(project, ['target_sets'])) * 100} color={colors.accent} trackColor={colors.surfaceElevated} />
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{completeSets === null ? t('projects.noPrintableFiles', { defaultValue: 'Link sliced printable files to calculate complete sets.' }) : t('projects.setsHint', { defaultValue: 'Limited by the printable file with the fewest completed copies.' })}</Text>
        </>}
      </SectionCard> : null}

      <InlineTabBar
        value={tab}
        tabs={[
          { key: 'summary', get label() { return translateNative('native.5dd3b694354b99ab'); } },
          { key: 'bom', get label() { return translateNative('native.827285178a7197a1', { defaultValue: 'BOM' }); } },
          { key: 'files', get label() { return translateNative('nav.files'); } },
          { key: 'timeline', get label() { return translateNative('native.a666d50a1f733fd7'); } },
          { key: 'archives', get label() { return translateNative('nav.archives'); } },
        ]}
        onChange={value => setTab(value as DetailTab)}
      />

      {tab === 'summary' ? (
        <>
          <SectionCard title={translateNative('native.be6245aeb9573da2')} subtitle={translateNative('native.37757aaece259583')}>
            {editingNotes ? (
              <>
                <RichProjectNotes key={`edit-${projectId}`} value={notes} editable onChange={setNotes} />
                <View style={styles.actions}>
                  <PrimaryButton label={translateNative('common.cancel')} variant="secondary" onPress={() => { setEditingNotes(false); setNotes(pickString(project, ['notes'])); }} />
                  <PrimaryButton
                    label={updateProjectMutation.isPending ? translateNative('native.018c2002806e2312') : translateNative('common.save')}
                    onPress={() => void updateProjectMutation.mutateAsync({ notes })}
                    loading={updateProjectMutation.isPending}
                  />
                </View>
              </>
            ) : (
              <RichProjectNotes key={pickString(project, ['notes'])} value={pickString(project, ['notes'], t('projects.noNotes', { defaultValue: 'No notes have been added yet.' }))} />
            )}
          </SectionCard>

          <SectionCard title={translateNative('native.fcdf9914bc139379')} subtitle={translateNative('native.04d1644409987730')}>
            <View style={styles.metricList}>
              <Text style={[styles.metricText, { color: colors.textSecondary }]}>{translateNative('native.141df6d955a0fc39')}<Text style={[styles.metricValue, { color: colors.text }]}>{formatCurrency(pickNumber(stats, ['estimated_cost'], 0))}</Text></Text>
              <Text style={[styles.metricText, { color: colors.textSecondary }]}>{translateNative('native.420f7547145641ec')}<Text style={[styles.metricValue, { color: colors.text }]}>{formatCurrency(pickNumber(stats, ['total_energy_cost'], 0))}</Text></Text>
              <Text style={[styles.metricText, { color: colors.textSecondary }]}>{translateNative('native.18d80e28ad2e1867')}<Text style={[styles.metricValue, { color: colors.text }]}>{formatCurrency(pickNumber(stats, ['bom_cost'], 0))}</Text></Text>
              <Text style={[styles.metricText, { color: colors.textSecondary }]}>{translateNative('native.bff0fe42f561136e')}<Text style={[styles.metricValue, { color: colors.text }]}>{formatCurrency(totalCost)}</Text></Text>
              {budget > 0 ? (
                <Text style={[styles.metricText, { color: colors.textSecondary }]}>{translateNative('native.fab2e47000696353')}<Text style={[styles.metricValue, { color: totalCost > budget ? colors.error : colors.success }]}>{formatCurrency(budget - totalCost)}</Text></Text>
              ) : null}
            </View>
          </SectionCard>
        </>
      ) : null}

      {tab === 'bom' ? (
        <SectionCard title={translateNative('native.d9cc3f8ab2bec84c')} subtitle={translateNative('native.b20a2bfc1fd4d8d1')}>
          <PrimaryButton label={hideCompletedBom ? t('projects.showAllBom', { defaultValue: 'Show all items' }) : t('projects.hideDoneBom', { defaultValue: 'Hide completed items' })} variant="secondary" onPress={() => setHideCompletedBom(value => !value)} />
          {hasPermission('projects:update') ? (
            <PrimaryButton label={translateNative('native.b2aab92f25d15a0a')} variant="secondary" onPress={() => openBomModal()} />
          ) : null}
          {visibleBomItems.length > 0 ? (
            visibleBomItems.map(item => (
              <View key={pickString(item, ['id'])} style={[styles.rowCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
                <View style={styles.rowHeader}>
                  <View style={styles.rowText}>
                    <Text style={[styles.rowTitle, { color: colors.text }]}>{pickString(item, ['name'], 'Part')} × {pickNumber(item, ['quantity_needed'], 1)}</Text>
                    <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>{translateNative('native.94c06078c0b344b1')}{pickNumber(item, ['quantity_acquired'], 0)} • {pickBoolean(item, ['is_complete']) ? translateNative('native.001d9a1f3aca801f') : translateNative('native.1d02121ce21f4721')}</Text>
                  </View>
                  <StatusBadge label={pickBoolean(item, ['is_complete']) ? translateNative('native.bf58e475c6fba6a6') : translateNative('native.fcc38c2bdcee1173')} color={pickBoolean(item, ['is_complete']) ? colors.success : colors.warning} />
                </View>
                {pickString(item, ['sourcing_url']) ? (
                  <Pressable onPress={() => void Linking.openURL(pickString(item, ['sourcing_url']))}>
                    <Text style={[styles.linkText, { color: colors.accentLight }]}>{pickString(item, ['sourcing_url'])}</Text>
                  </Pressable>
                ) : null}
                {pickString(item, ['remarks']) ? <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>{pickString(item, ['remarks'])}</Text> : null}
                <Text style={[styles.rowMeta, { color: colors.textSecondary }]}><NativeTranslation id="native.71128b0e1ec04ed6" values={{ value0: (pickString(item, ['unit_price']) ? formatCurrency(pickNumber(item, ['unit_price'], 0)) : '—') }} /></Text>
                {hasPermission('projects:update') ? (
                  <View style={styles.actions}>
                    <PrimaryButton label={translateNative('common.edit')} variant="secondary" onPress={() => openBomModal(item)} />
                    <PrimaryButton
                      label={pickBoolean(item, ['is_complete']) ? translateNative('native.83bcdf6010cb15df') : translateNative('native.ee2c6e9275f3e317')}
                      variant="secondary"
                      onPress={() =>
                        void toggleBomMutation.mutateAsync({
                          itemId: pickNumber(item, ['id']),
                          quantityAcquired: pickBoolean(item, ['is_complete']) ? 0 : pickNumber(item, ['quantity_needed'], 1),
                        })
                      }
                    />
                    <PrimaryButton label={t('common.delete')} variant="danger" disabled={deleteBomMutation.isPending} onPress={() => Alert.alert(
                      t('projects.deleteBomTitle', { defaultValue: 'Delete BOM item?' }),
                      t('projects.deleteBomConfirm', { defaultValue: 'Delete “{{name}}”? This cannot be undone.', name: pickString(item, ['name']) }),
                      [{ text: t('common.cancel'), style: 'cancel' }, { text: t('common.delete'), style: 'destructive', onPress: () => deleteBomMutation.mutate(pickNumber(item, ['id'])) }],
                    )} />
                  </View>
                ) : null}
              </View>
            ))
          ) : (
            <EmptyState icon="🧾" title={translateNative('native.784046b30f674dfc')} message={translateNative('native.a6f198d64bc83bfb')} />
          )}
        </SectionCard>
      ) : null}

      {tab === 'files' ? (
        <>
          {modelFiles.length > 0 ? (
            <SectionCard title={translateNative('native.1f80ec5de6f51f8f')} subtitle={translateNative('native.e4fe4f0f1c65d97c')}>
              {modelFiles.map(file => (
                <View key={pickString(file, ['id'])} style={[styles.rowCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                  {pickString(file, ['thumbnail_path']) ? (
                    <Image source={{ uri: api.getLibraryFileThumbnailUrl(pickNumber(file, ['id'])) }} style={styles.modelThumb} />
                  ) : (
                    <View style={[styles.modelThumb, { backgroundColor: colors.surfaceHover }]} />
                  )}
                  <View style={styles.rowText}>
                    <Text style={[styles.rowTitle, { color: colors.text }]}>{pickString(file, ['print_name', 'filename'], translateNative('native.7e2ce9667bb8c7c5'))}</Text>
                    <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
                      {pickString(file, ['filename'], translateNative('native.497504159133a38a'))}
                    </Text>
                  </View>
                  <View style={styles.actions}>
                    <PrimaryButton
                      label={translateNative('native.512dd0183261301e')}
                      variant="secondary"
                      onPress={() =>
                        void Linking.openURL(api.getLibraryFileDownloadUrl(pickNumber(file, ['id']))).catch(() => {
                          showToast(nativeMessage('native.621f9d863b59e34f'), 'error');
                        })
                      }
                    />
                  </View>
                </View>
              ))}
            </SectionCard>
          ) : null}

          <SectionCard title={translateNative('native.6b8d5dd0984a3fbc')} subtitle={translateNative('native.d7de4bf763fae5c4')}>
            {hasPermission('projects:update') ? <PrimaryButton variant="secondary" label={t('projects.linkLibrary', { defaultValue: 'Link library files or folders' })} onPress={() => openLibrary(navigation, { projectId })} /> : null}
            {linkedFolders.length > 0 ? (
              linkedFolders.map(folder => (
                <View key={pickString(folder, ['id'])} style={[styles.rowCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
                  <Text style={[styles.rowTitle, { color: colors.text }]}>{pickString(folder, ['name'], 'Folder')}</Text>
                  <PrimaryButton variant="secondary" label={t('projects.openFolder', { defaultValue: 'Open folder in Library' })} onPress={() => openLibrary(navigation, { folderId: pickNumber(folder, ['id']) })} />
                  <Text style={[styles.rowMeta, { color: colors.textSecondary }]}><NativeTranslation id="native.13cd672108542066" values={{ value0: (pickNumber(folder, ['file_count'], 0)) }} /></Text>
                  {(filesByFolder.get(pickNumber(folder, ['id'])) ?? []).map(file => (
                    <View key={pickString(file, ['id'])} style={styles.fileRow}>
                      {pickString(file, ['thumbnail_path']) ? (
                        <Image source={{ uri: api.getLibraryFileThumbnailUrl(pickNumber(file, ['id'])) }} style={styles.fileThumb} />
                      ) : (
                        <View style={[styles.fileThumb, { backgroundColor: colors.surfaceHover }]} />
                      )}
                      <View style={styles.rowText}>
                        <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>{pickString(file, ['print_name', 'filename'], translateNative('native.7d48488dfe9b1959'))}</Text>
                        <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>{pickString(file, ['file_type'], 'file').toUpperCase()}</Text>
                        {isPrintableProjectFile(file) ? <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>{fileProgressQuery.isError ? t('projects.progressError', { defaultValue: 'Unable to load production progress.' }) : fileProgressQuery.isLoading ? t('projects.loadingProgress', { defaultValue: 'Loading production progress…' }) : t('projects.fileProduction', {
                          defaultValue: '{{done}} printed · target {{target}} · {{remaining}} remaining',
                          done: progressByFileId.get(pickNumber(file, ['id'])) ?? 0,
                          target: pickNumber(project, ['target_sets']) || '—',
                          remaining: pickNumber(project, ['target_sets']) ? Math.max(0, pickNumber(project, ['target_sets']) - (progressByFileId.get(pickNumber(file, ['id'])) ?? 0)) : '—',
                        })}</Text> : null}
                        <PrimaryButton variant="secondary" label={t('projects.openFile', { defaultValue: 'Open in Library' })} onPress={() => openLibrary(navigation, { folderId: pickNumber(folder, ['id']), fileId: pickNumber(file, ['id']) })} />
                      </View>
                      <StatusBadge label={pickString(file, ['file_type'], 'file')} color={colors.accent} />
                    </View>
                  ))}
                </View>
              ))
            ) : (
              <EmptyState icon="📁" title={translateNative('native.6c5ba107b86be16d')} message={t('projects.linkFilesHint', { defaultValue: 'Use Link library files or folders to associate existing library content.' })} />
            )}
          </SectionCard>
        </>
      ) : null}

      {tab === 'timeline' ? (
        <SectionCard title={translateNative('native.a666d50a1f733fd7')} subtitle={translateNative('native.d9f73aabd8bda9d4')}>
          {timeline.length > 0 ? (
            timeline.map((event, index) => (
              <View key={`${pickString(event, ['timestamp'])}-${index}`} style={[styles.rowCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
                <Text style={[styles.rowTitle, { color: colors.text }]}>{pickString(event, ['title'], pickString(event, ['event_type'], 'Event'))}</Text>
                {pickString(event, ['description']) ? <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>{pickString(event, ['description'])}</Text> : null}
                <Text style={[styles.rowMeta, { color: colors.textTertiary }]}>{formatDateTime(pickString(event, ['timestamp']))}</Text>
              </View>
            ))
          ) : (
            <EmptyState icon="🕒" title={translateNative('native.dd547a92728e4076')} message={translateNative('native.8daf52a000f7c1ef')} />
          )}
        </SectionCard>
      ) : null}

      {tab === 'archives' ? (
        <SectionCard title={translateNative('native.1dd5d4e8c9fbaad2')} subtitle={translateNative('native.505f344a21870ea0')}>
          {archives.length > 0 ? (
            <View style={styles.archiveGrid}>
              {archives.map(archive => (
                <Pressable
                  key={pickString(archive, ['id'])}
                  onPress={() => navigation.navigate('ArchiveDetail', { id: pickNumber(archive, ['id']) })}
                  style={[styles.archiveCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                >
                  {pickString(archive, ['thumbnail_path']) ? (
                    <Image source={{ uri: api.getArchiveThumbnail(pickNumber(archive, ['id'])) }} style={styles.archiveImage} />
                  ) : (
                    <View style={[styles.archiveImage, { backgroundColor: colors.surfaceHover }]} />
                  )}
                  <Text style={[styles.archiveTitle, { color: colors.text }]} numberOfLines={1}>{pickString(archive, ['print_name', 'name'], 'Archive')}</Text>
                  <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>{pickString(archive, ['status'], 'unknown')}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <EmptyState icon="🧱" title={translateNative('native.b26c90cb0ffc483b')} message={translateNative('native.ac7b2dd20886188f')} />
          )}
        </SectionCard>
      ) : null}

      <Modal visible={showBomModal} animationType="slide" transparent>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}> 
          <View style={[styles.modalCard, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{editingBom ? translateNative('native.9f02e72776c8ac97') : translateNative('native.b2aab92f25d15a0a')}</Text>
              <TextField label={translateNative('common.name')} value={bomForm.name} onChangeText={value => setBomForm(current => ({ ...current, name: value }))} />
              <TextField label={translateNative('native.21b371aa984e4c97')} value={bomForm.quantity} onChangeText={value => setBomForm(current => ({ ...current, quantity: value }))} keyboardType="number-pad" />
              <TextField label={translateNative('native.40db276f2fad70d7')} value={bomForm.price} onChangeText={value => setBomForm(current => ({ ...current, price: value }))} keyboardType="decimal-pad" />
              <TextField label={translateNative('native.a37c9821a5c4bdca')} value={bomForm.url} onChangeText={value => setBomForm(current => ({ ...current, url: value }))} autoCapitalize="none" />
              <TextField label={translateNative('native.5f1b2b8078043d10')} value={bomForm.remarks} onChangeText={value => setBomForm(current => ({ ...current, remarks: value }))} multiline />
              <View style={styles.actions}>
                <PrimaryButton label={translateNative('common.cancel')} variant="secondary" onPress={() => { setShowBomModal(false); setEditingBom(null); setBomForm(DEFAULT_BOM); }} />
                <PrimaryButton
                  label={editingBom ? (updateBomMutation.isPending ? translateNative('native.018c2002806e2312') : translateNative('common.save')) : (createBomMutation.isPending ? translateNative('native.71daaf40bd1e94d2') : translateNative('native.1ed703d3bc2c151a'))}
                  onPress={() => void (editingBom ? updateBomMutation.mutateAsync() : createBomMutation.mutateAsync())}
                  disabled={!bomForm.name.trim() || createBomMutation.isPending || updateBomMutation.isPending}
                  loading={createBomMutation.isPending || updateBomMutation.isPending}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
      <ProjectBatchPrintModal
        visible={showBatchModal}
        onClose={() => setShowBatchModal(false)}
        projectId={projectId}
        projectName={pickString(project, ['name'], 'Project')}
      />
      <ProjectPipelineModal
        visible={showPipelineModal}
        onClose={() => setShowPipelineModal(false)}
        projectId={projectId}
        projectName={pickString(project, ['name'], 'Project')}
      />
      <ProjectSliceModal
        visible={showSliceModal}
        onClose={() => setShowSliceModal(false)}
        projectId={projectId}
        projectName={pickString(project, ['name'], 'Project')}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  summaryBadges: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  progressSection: {
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  progressLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  progressMeta: {
    fontSize: fontSize.xs,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  bodyText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  metricList: { gap: spacing.sm },
  metricText: { fontSize: fontSize.sm },
  metricValue: { fontWeight: fontWeight.semibold },
  rowCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowText: { flex: 1, gap: spacing.xs },
  rowTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  rowMeta: { fontSize: fontSize.sm },
  linkText: { fontSize: fontSize.sm },
  fileRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  fileThumb: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
  },
  modelThumb: {
    width: '100%',
    height: 180,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  archiveGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  archiveCard: {
    width: '47%',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  archiveImage: {
    width: '100%',
    aspectRatio: 1,
  },
  archiveTitle: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: borderRadius['2xl'],
    maxHeight: '90%',
  },
  modalContent: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
});
