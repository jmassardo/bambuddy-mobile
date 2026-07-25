import React, { useMemo, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RootNavigationProp, RootRouteProp } from '@/navigation/types';
import {
  Image,
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
  const navigation = useNavigation<RootNavigationProp<'ProjectDetail'>>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Project' });
  }, [navigation]);

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

  const refreshAll = async () => {
    await Promise.all([
      projectQuery.refetch(),
      archivesQuery.refetch(),
      bomQuery.refetch(),
      timelineQuery.refetch(),
      linkedFoldersQuery.refetch(),
      projectFilesQuery.refetch(),
    ]);
  };

  const updateProjectMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.updateProject(projectId, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      setEditingNotes(false);
      showToast('Project updated.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to update project.', 'error'),
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
      showToast('BOM item added.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to add BOM item.', 'error'),
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
      showToast('BOM item updated.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to update BOM item.', 'error'),
  });

  const toggleBomMutation = useMutation({
    mutationFn: ({ itemId, quantityAcquired }: { itemId: number; quantityAcquired: number }) =>
      api.updateBOMItem(projectId, itemId, { quantity_acquired: quantityAcquired }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projectBOM', projectId] });
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      showToast('BOM item updated.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to update BOM item.', 'error'),
  });

  const deleteBomMutation = useMutation({
    mutationFn: (itemId: number) => api.deleteBOMItem(projectId, itemId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projectBOM', projectId] });
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      showToast('BOM item removed.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to remove BOM item.', 'error'),
  });

  const project = (projectQuery.data ?? null) as ApiRecord | null;
  const archives = useMemo(() => ((archivesQuery.data ?? []) as ApiRecord[]), [archivesQuery.data]);
  const bomItems = useMemo(() => ((bomQuery.data ?? []) as ApiRecord[]), [bomQuery.data]);
  const timeline = useMemo(() => ((timelineQuery.data ?? []) as ApiRecord[]), [timelineQuery.data]);
  const linkedFolders = useMemo(() => ((linkedFoldersQuery.data ?? []) as ApiRecord[]), [linkedFoldersQuery.data]);
  const projectFiles = useMemo(() => ((projectFilesQuery.data ?? []) as ApiRecord[]), [projectFilesQuery.data]);
  const modelFiles = useMemo(
    () => projectFiles.filter(isProjectModelFile),
    [projectFiles],
  );

  const filesByFolder = useMemo(() => {
    const map = new Map<number, ApiRecord[]>();
    projectFiles.forEach(file => {
      const folderId = pickNumber(file, ['folder_id'], -1);
      if (folderId < 0) return;
      map.set(folderId, [...(map.get(folderId) ?? []), file]);
    });
    return map;
  }, [projectFiles]);

  const stats = (project?.stats ?? {}) as ApiRecord;

  React.useEffect(() => {
    if (project && !editingNotes) {
      setNotes(pickString(project, ['notes']));
    }
  }, [editingNotes, project]);

  if (projectQuery.isLoading) {
    return <LoadingScreen message="Loading project…" />;
  }

  if (projectQuery.isError || !project) {
    return (
      <ErrorState
        message="Unable to load the selected project."
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
        title={pickString(project, ['name'], 'Unnamed project')}
        subtitle={pickString(project, ['description'], 'No project description')}
        right={<StatusBadge label={status} color={statusColor(status, colors)} />}
      >
        <View style={styles.summaryBadges}>
          <StatusBadge label={priority} color={statusColor(priority, colors)} />
          {pickString(project, ['due_date']) ? (
            <StatusBadge label={`Due ${formatDate(pickString(project, ['due_date']))}`} color={colors.warning} />
          ) : null}
        </View>
        <View style={styles.summaryGrid}>
          <StatCard label="Print jobs" value={String(pickNumber(stats, ['total_archives'], archives.length))} />
          <StatCard label="Print time" value={formatDuration(pickNumber(stats, ['total_print_time_hours'], 0) * 3600)} />
          <StatCard label="Filament" value={formatWeight(pickNumber(stats, ['total_filament_grams'], 0))} />
          <StatCard label="Budget" value={budget > 0 ? formatCurrency(budget) : '—'} />
        </View>
        <View style={styles.progressSection}>
          <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>Plates progress</Text>
          <ProgressBar progress={progress} color={colors.accent} trackColor={colors.surfaceElevated} />
          <Text style={[styles.progressMeta, { color: colors.textSecondary }]}>{Math.round(progress)}% • {pickNumber(stats, ['remaining_prints'], 0)} remaining</Text>
          <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>Parts progress</Text>
          <ProgressBar progress={partsProgress} color={colors.info} trackColor={colors.surfaceElevated} />
          <Text style={[styles.progressMeta, { color: colors.textSecondary }]}>{Math.round(partsProgress)}% • {pickNumber(stats, ['remaining_parts'], 0)} remaining</Text>
        </View>
        <View style={styles.actions}>
          <PrimaryButton label="Batch Print" variant="secondary" onPress={() => setShowBatchModal(true)} />
          <PrimaryButton label="Run Pipeline" variant="secondary" onPress={() => setShowPipelineModal(true)} />
          <PrimaryButton label="Slice" variant="secondary" onPress={() => setShowSliceModal(true)} />
          {pickString(project, ['url']) ? (
            <PrimaryButton label="Open link" variant="secondary" onPress={() => void Linking.openURL(pickString(project, ['url']))} />
          ) : null}
          {hasPermission('projects:update') ? (
            <PrimaryButton
              label={editingNotes ? (updateProjectMutation.isPending ? 'Saving…' : 'Save notes') : 'Edit notes'}
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

      <InlineTabBar
        value={tab}
        tabs={[
          { key: 'summary', label: 'Summary' },
          { key: 'bom', label: 'BOM' },
          { key: 'files', label: 'Files' },
          { key: 'timeline', label: 'Timeline' },
          { key: 'archives', label: 'Archives' },
        ]}
        onChange={value => setTab(value as DetailTab)}
      />

      {tab === 'summary' ? (
        <>
          <SectionCard title="Notes" subtitle="Project summary, instructions, and context.">
            {editingNotes ? (
              <>
                <TextField label="Notes" value={notes} onChangeText={setNotes} multiline />
                <View style={styles.actions}>
                  <PrimaryButton label="Cancel" variant="secondary" onPress={() => { setEditingNotes(false); setNotes(pickString(project, ['notes'])); }} />
                  <PrimaryButton
                    label={updateProjectMutation.isPending ? 'Saving…' : 'Save'}
                    onPress={() => void updateProjectMutation.mutateAsync({ notes })}
                    loading={updateProjectMutation.isPending}
                  />
                </View>
              </>
            ) : (
              <Text style={[styles.bodyText, { color: colors.textSecondary }]}> 
                {pickString(project, ['notes'], 'No notes have been added yet.')}
              </Text>
            )}
          </SectionCard>

          <SectionCard title="Cost tracking" subtitle="Filament, energy, BOM, and budget status.">
            <View style={styles.metricList}>
              <Text style={[styles.metricText, { color: colors.textSecondary }]}>Filament cost: <Text style={[styles.metricValue, { color: colors.text }]}>{formatCurrency(pickNumber(stats, ['estimated_cost'], 0))}</Text></Text>
              <Text style={[styles.metricText, { color: colors.textSecondary }]}>Energy cost: <Text style={[styles.metricValue, { color: colors.text }]}>{formatCurrency(pickNumber(stats, ['total_energy_cost'], 0))}</Text></Text>
              <Text style={[styles.metricText, { color: colors.textSecondary }]}>BOM cost: <Text style={[styles.metricValue, { color: colors.text }]}>{formatCurrency(pickNumber(stats, ['bom_cost'], 0))}</Text></Text>
              <Text style={[styles.metricText, { color: colors.textSecondary }]}>Total cost: <Text style={[styles.metricValue, { color: colors.text }]}>{formatCurrency(totalCost)}</Text></Text>
              {budget > 0 ? (
                <Text style={[styles.metricText, { color: colors.textSecondary }]}>Budget remaining: <Text style={[styles.metricValue, { color: totalCost > budget ? colors.error : colors.success }]}>{formatCurrency(budget - totalCost)}</Text></Text>
              ) : null}
            </View>
          </SectionCard>
        </>
      ) : null}

      {tab === 'bom' ? (
        <SectionCard title="Bill of materials" subtitle="Parts to source, buy, or track for this project.">
          {hasPermission('projects:update') ? (
            <PrimaryButton label="Add BOM item" variant="secondary" onPress={() => openBomModal()} />
          ) : null}
          {bomItems.length > 0 ? (
            bomItems.map(item => (
              <View key={pickString(item, ['id'])} style={[styles.rowCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
                <View style={styles.rowHeader}>
                  <View style={styles.rowText}>
                    <Text style={[styles.rowTitle, { color: colors.text }]}>{pickString(item, ['name'], 'Part')} × {pickNumber(item, ['quantity_needed'], 1)}</Text>
                    <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>Acquired: {pickNumber(item, ['quantity_acquired'], 0)} • {pickBoolean(item, ['is_complete']) ? 'Complete' : 'Open'}</Text>
                  </View>
                  <StatusBadge label={pickBoolean(item, ['is_complete']) ? 'done' : 'open'} color={pickBoolean(item, ['is_complete']) ? colors.success : colors.warning} />
                </View>
                {pickString(item, ['sourcing_url']) ? (
                  <Pressable onPress={() => void Linking.openURL(pickString(item, ['sourcing_url']))}>
                    <Text style={[styles.linkText, { color: colors.accentLight }]}>{pickString(item, ['sourcing_url'])}</Text>
                  </Pressable>
                ) : null}
                {pickString(item, ['remarks']) ? <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>{pickString(item, ['remarks'])}</Text> : null}
                <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>Unit price: {pickString(item, ['unit_price']) ? formatCurrency(pickNumber(item, ['unit_price'], 0)) : '—'}</Text>
                {hasPermission('projects:update') ? (
                  <View style={styles.actions}>
                    <PrimaryButton label="Edit" variant="secondary" onPress={() => openBomModal(item)} />
                    <PrimaryButton
                      label={pickBoolean(item, ['is_complete']) ? 'Mark open' : 'Mark acquired'}
                      variant="secondary"
                      onPress={() =>
                        void toggleBomMutation.mutateAsync({
                          itemId: pickNumber(item, ['id']),
                          quantityAcquired: pickBoolean(item, ['is_complete']) ? 0 : pickNumber(item, ['quantity_needed'], 1),
                        })
                      }
                    />
                    <PrimaryButton label="Delete" variant="danger" onPress={() => void deleteBomMutation.mutateAsync(pickNumber(item, ['id']))} />
                  </View>
                ) : null}
              </View>
            ))
          ) : (
            <EmptyState icon="🧾" title="No BOM items" message="Add project parts, sourcing links, and costs here." />
          )}
        </SectionCard>
      ) : null}

      {tab === 'files' ? (
        <>
          {modelFiles.length > 0 ? (
            <SectionCard title="3D model files" subtitle="Open STL and 3MF models in the device browser when you need a richer viewer.">
              {modelFiles.map(file => (
                <View key={pickString(file, ['id'])} style={[styles.rowCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                  {pickString(file, ['thumbnail_path']) ? (
                    <Image source={{ uri: api.getLibraryFileThumbnailUrl(pickNumber(file, ['id'])) }} style={styles.modelThumb} />
                  ) : (
                    <View style={[styles.modelThumb, { backgroundColor: colors.surfaceHover }]} />
                  )}
                  <View style={styles.rowText}>
                    <Text style={[styles.rowTitle, { color: colors.text }]}>{pickString(file, ['print_name', 'filename'], 'Model file')}</Text>
                    <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
                      {pickString(file, ['filename'], 'Unknown file')}
                    </Text>
                  </View>
                  <View style={styles.actions}>
                    <PrimaryButton
                      label="View in browser"
                      variant="secondary"
                      onPress={() =>
                        void Linking.openURL(api.getLibraryFileDownloadUrl(pickNumber(file, ['id']))).catch(() => {
                          showToast('Unable to open this model file.', 'error');
                        })
                      }
                    />
                  </View>
                </View>
              ))}
            </SectionCard>
          ) : null}

          <SectionCard title="Linked files" subtitle="Library folders and printable files connected to this project.">
            {linkedFolders.length > 0 ? (
              linkedFolders.map(folder => (
                <View key={pickString(folder, ['id'])} style={[styles.rowCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
                  <Text style={[styles.rowTitle, { color: colors.text }]}>{pickString(folder, ['name'], 'Folder')}</Text>
                  <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>Files: {pickNumber(folder, ['file_count'], 0)}</Text>
                  {(filesByFolder.get(pickNumber(folder, ['id'])) ?? []).map(file => (
                    <View key={pickString(file, ['id'])} style={styles.fileRow}>
                      {pickString(file, ['thumbnail_path']) ? (
                        <Image source={{ uri: api.getLibraryFileThumbnailUrl(pickNumber(file, ['id'])) }} style={styles.fileThumb} />
                      ) : (
                        <View style={[styles.fileThumb, { backgroundColor: colors.surfaceHover }]} />
                      )}
                      <View style={styles.rowText}>
                        <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>{pickString(file, ['print_name', 'filename'], 'Library file')}</Text>
                        <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>{pickString(file, ['file_type'], 'file').toUpperCase()}</Text>
                      </View>
                      <StatusBadge label={pickString(file, ['file_type'], 'file')} color={colors.accent} />
                    </View>
                  ))}
                </View>
              ))
            ) : (
              <EmptyState icon="📁" title="No linked folders" message="Link File Manager folders on the web to surface them here." />
            )}
          </SectionCard>
        </>
      ) : null}

      {tab === 'timeline' ? (
        <SectionCard title="Timeline" subtitle="Recent project events, prints, and changes.">
          {timeline.length > 0 ? (
            timeline.map((event, index) => (
              <View key={`${pickString(event, ['timestamp'])}-${index}`} style={[styles.rowCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
                <Text style={[styles.rowTitle, { color: colors.text }]}>{pickString(event, ['title'], pickString(event, ['event_type'], 'Event'))}</Text>
                {pickString(event, ['description']) ? <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>{pickString(event, ['description'])}</Text> : null}
                <Text style={[styles.rowMeta, { color: colors.textTertiary }]}>{formatDateTime(pickString(event, ['timestamp']))}</Text>
              </View>
            ))
          ) : (
            <EmptyState icon="🕒" title="No timeline events" message="Project activity will appear here once work starts." />
          )}
        </SectionCard>
      ) : null}

      {tab === 'archives' ? (
        <SectionCard title="Archive grid" subtitle="Print history attached to this project.">
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
            <EmptyState icon="🧱" title="No project archives" message="Printed jobs for this project will show up here." />
          )}
        </SectionCard>
      ) : null}

      <Modal visible={showBomModal} animationType="slide" transparent>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}> 
          <View style={[styles.modalCard, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{editingBom ? 'Edit BOM item' : 'Add BOM item'}</Text>
              <TextField label="Name" value={bomForm.name} onChangeText={value => setBomForm(current => ({ ...current, name: value }))} />
              <TextField label="Quantity needed" value={bomForm.quantity} onChangeText={value => setBomForm(current => ({ ...current, quantity: value }))} keyboardType="number-pad" />
              <TextField label="Unit price" value={bomForm.price} onChangeText={value => setBomForm(current => ({ ...current, price: value }))} keyboardType="decimal-pad" />
              <TextField label="Sourcing URL" value={bomForm.url} onChangeText={value => setBomForm(current => ({ ...current, url: value }))} autoCapitalize="none" />
              <TextField label="Remarks" value={bomForm.remarks} onChangeText={value => setBomForm(current => ({ ...current, remarks: value }))} multiline />
              <View style={styles.actions}>
                <PrimaryButton label="Cancel" variant="secondary" onPress={() => { setShowBomModal(false); setEditingBom(null); setBomForm(DEFAULT_BOM); }} />
                <PrimaryButton
                  label={editingBom ? (updateBomMutation.isPending ? 'Saving…' : 'Save') : (createBomMutation.isPending ? 'Adding…' : 'Add item')}
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
