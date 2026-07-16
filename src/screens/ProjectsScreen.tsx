import React, { useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DocumentPicker, { isCancel } from 'react-native-document-picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { FloatingActionButton, InlineTabBar, PrimaryButton, SearchBar, StatusBadge, TextField } from '@/components/common/AppUI';
import { EmptyState, ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { ProjectBatchPrintModal } from '@/components/projects/ProjectActionModals';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { formatDate, formatCurrency, pickNumber, pickString, statusColor, type ApiRecord } from '@/utils/data';
import { proxyThumbnailUrl } from '@/utils/media';

type StatusFilter = 'all' | 'active' | 'completed' | 'archived';

interface ProjectFormState {
  name: string;
  description: string;
  color: string;
  targetCount: string;
  targetPartsCount: string;
  url: string;
  tags: string;
  dueDate: string;
  priority: string;
  budget: string;
  status: string;
}

const PROJECT_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280'];

const DEFAULT_FORM: ProjectFormState = {
  name: '',
  description: '',
  color: PROJECT_COLORS[0],
  targetCount: '',
  targetPartsCount: '',
  url: '',
  tags: '',
  dueDate: '',
  priority: 'normal',
  budget: '',
  status: 'active',
};

function projectCoverUrl(project: ApiRecord): string | null {
  const projectId = pickNumber(project, ['id']);
  if (pickString(project, ['cover_image_filename'])) {
    return api.getProjectCoverImageUrl(projectId);
  }

  return proxyThumbnailUrl(pickString(project, ['cover_url', 'thumbnail_url']));
}

export default function ProjectsScreen() {
  const navigation = useNavigation<any>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Projects' });
  }, [navigation]);

  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingProject, setEditingProject] = useState<ApiRecord | null>(null);
  const [batchProject, setBatchProject] = useState<ApiRecord | null>(null);
  const [form, setForm] = useState<ProjectFormState>(DEFAULT_FORM);

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.getProjects(),
  });

  const resetModal = () => {
    setShowModal(false);
    setEditingProject(null);
    setForm(DEFAULT_FORM);
  };

  const invalidateProjects = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
      editingProject
        ? queryClient.invalidateQueries({ queryKey: ['project', pickNumber(editingProject, ['id'])] })
        : Promise.resolve(),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      api.createProject({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        color: form.color,
        target_count: form.targetCount ? Number(form.targetCount) : undefined,
        target_parts_count: form.targetPartsCount ? Number(form.targetPartsCount) : undefined,
        url: form.url.trim() || undefined,
        tags: form.tags.trim() || undefined,
        due_date: form.dueDate || undefined,
        priority: form.priority,
        budget: form.budget.trim() ? Number(form.budget) : null,
      }),
    onSuccess: async () => {
      await invalidateProjects();
      resetModal();
      showToast('Project created.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to create project.', 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.updateProject(pickNumber(editingProject, ['id']), {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        color: form.color,
        status: form.status,
        target_count: form.targetCount ? Number(form.targetCount) : undefined,
        target_parts_count: form.targetPartsCount ? Number(form.targetPartsCount) : undefined,
        url: form.url.trim() || null,
        tags: form.tags.trim() || undefined,
        due_date: form.dueDate || undefined,
        priority: form.priority,
        budget: form.budget.trim() ? Number(form.budget) : null,
      }),
    onSuccess: async () => {
      await invalidateProjects();
      resetModal();
      showToast('Project updated.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to update project.', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteProject(id),
    onSuccess: async () => {
      await invalidateProjects();
      showToast('Project deleted.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to delete project.', 'error'),
  });

  const coverMutation = useMutation({
    mutationFn: async (projectId: number) => {
      const asset = await DocumentPicker.pickSingle({ type: [DocumentPicker.types.images] });
      return api.uploadProjectCoverImage(projectId, {
        uri: asset.fileCopyUri ?? asset.uri,
        name: asset.name ?? 'cover-image',
        type: asset.type ?? 'image/jpeg',
      });
    },
    onSuccess: async () => {
      await invalidateProjects();
      showToast('Cover image updated.', 'success');
    },
    onError: (error: unknown) => {
      if (isCancel(error)) return;
      showToast(error instanceof Error ? error.message : 'Unable to upload cover image.', 'error');
    },
  });

  const removeCoverMutation = useMutation({
    mutationFn: (projectId: number) => api.deleteProjectCoverImage(projectId),
    onSuccess: async () => {
      await invalidateProjects();
      showToast('Cover image removed.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to remove cover image.', 'error'),
  });

  const projects = useMemo(() => ((projectsQuery.data ?? []) as ApiRecord[]), [projectsQuery.data]);
  const filteredProjects = useMemo(() => {
    const term = search.trim().toLowerCase();
    return projects.filter(project => {
      const status = pickString(project, ['status'], 'active');
      if (filter !== 'all' && status !== filter) return false;
      if (!term) return true;
      return [
        pickString(project, ['name']),
        pickString(project, ['description']),
        pickString(project, ['tags']),
        pickString(project, ['url']),
      ]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [filter, projects, search]);

  const openCreate = () => {
    setEditingProject(null);
    setForm(DEFAULT_FORM);
    setShowModal(true);
  };

  const openEdit = (project: ApiRecord) => {
    setEditingProject(project);
    setForm({
      name: pickString(project, ['name']),
      description: pickString(project, ['description']),
      color: pickString(project, ['color'], PROJECT_COLORS[0]),
      targetCount: pickString(project, ['target_count']),
      targetPartsCount: pickString(project, ['target_parts_count']),
      url: pickString(project, ['url']),
      tags: pickString(project, ['tags']),
      dueDate: pickString(project, ['due_date']).split('T')[0] || '',
      priority: pickString(project, ['priority'], 'normal'),
      budget: pickString(project, ['budget']),
      status: pickString(project, ['status'], 'active'),
    });
    setShowModal(true);
  };

  if (projectsQuery.isLoading) {
    return <LoadingScreen message="Loading projects…" />;
  }

  if (projectsQuery.isError) {
    return (
      <ErrorState
        message="Unable to load projects."
        onRetry={() => void projectsQuery.refetch()}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <FlatList
        data={filteredProjects}
        keyExtractor={item => pickString(item, ['id'])}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        refreshControl={
          <RefreshControl
            refreshing={projectsQuery.isRefetching}
            onRefresh={() => void projectsQuery.refetch()}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerArea}>
            <SearchBar value={search} onChangeText={setSearch} placeholder="Search projects" />
            <InlineTabBar
              value={filter}
              tabs={[
                { key: 'all', label: 'All' },
                { key: 'active', label: 'Active' },
                { key: 'completed', label: 'Completed' },
                { key: 'archived', label: 'Archived' },
              ]}
              onChange={value => setFilter(value as StatusFilter)}
            />
          </View>
        }
        renderItem={({ item }) => {
          const status = pickString(item, ['status'], 'active');
          const progress = Math.max(
            pickNumber(item, ['progress_percent'], 0),
            pickNumber(item, ['target_parts_count'], 0) > 0
              ? (pickNumber(item, ['completed_count'], 0) / Math.max(pickNumber(item, ['target_parts_count'], 1), 1)) * 100
              : 0,
          );
          const cover = projectCoverUrl(item);
          return (
            <PressableProjectCard
              colors={colors}
              title={pickString(item, ['name'], 'Unnamed project')}
              description={pickString(item, ['description'], 'No description')}
              status={status}
              priority={pickString(item, ['priority'], 'normal')}
              dueDate={pickString(item, ['due_date'])}
              progress={progress}
              budget={pickString(item, ['budget'])}
              cover={cover}
              onOpen={() => navigation.navigate('ProjectDetail', { id: pickNumber(item, ['id']) })}
              onBatchPrint={() => setBatchProject(item)}
              onEdit={() => openEdit(item)}
              onDelete={() =>
                Alert.alert('Delete project', `Delete ${pickString(item, ['name'])}?`, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => void deleteMutation.mutateAsync(pickNumber(item, ['id'])),
                  },
                ])
              }
            />
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon="📁"
            title="No projects found"
            message="Try a different filter or create a new project."
          />
        }
      />

      <FloatingActionButton icon="plus" label="Project" onPress={openCreate} />

      <Modal visible={showModal} animationType="slide" transparent>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}> 
          <View style={[styles.modalCard, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{editingProject ? 'Edit project' : 'New project'}</Text>
              <TextField label="Name" value={form.name} onChangeText={value => setForm(current => ({ ...current, name: value }))} />
              <TextField label="Description" value={form.description} onChangeText={value => setForm(current => ({ ...current, description: value }))} multiline />
              <TextField label="External URL" value={form.url} onChangeText={value => setForm(current => ({ ...current, url: value }))} placeholder="https://…" autoCapitalize="none" />
              <TextField label="Tags" value={form.tags} onChangeText={value => setForm(current => ({ ...current, tags: value }))} placeholder="prototype, urgent" />

              <View style={styles.colorRow}>
                {PROJECT_COLORS.map(color => (
                  <PressableSwatch
                    key={color}
                    color={color}
                    selected={form.color === color}
                    onPress={() => setForm(current => ({ ...current, color }))}
                  />
                ))}
              </View>

              <View style={styles.splitRow}>
                <View style={styles.splitField}><TextField label="Target plates" value={form.targetCount} onChangeText={value => setForm(current => ({ ...current, targetCount: value }))} keyboardType="number-pad" /></View>
                <View style={styles.splitField}><TextField label="Target parts" value={form.targetPartsCount} onChangeText={value => setForm(current => ({ ...current, targetPartsCount: value }))} keyboardType="number-pad" /></View>
              </View>
              <View style={styles.splitRow}>
                <View style={styles.splitField}><TextField label="Due date" value={form.dueDate} onChangeText={value => setForm(current => ({ ...current, dueDate: value }))} placeholder="YYYY-MM-DD" /></View>
                <View style={styles.splitField}><TextField label="Priority" value={form.priority} onChangeText={value => setForm(current => ({ ...current, priority: value }))} placeholder="low | normal | high | urgent" /></View>
              </View>
              <View style={styles.splitRow}>
                <View style={styles.splitField}><TextField label="Budget" value={form.budget} onChangeText={value => setForm(current => ({ ...current, budget: value }))} keyboardType="decimal-pad" /></View>
                {editingProject ? (
                  <View style={styles.splitField}><TextField label="Status" value={form.status} onChangeText={value => setForm(current => ({ ...current, status: value }))} placeholder="active | completed | archived" /></View>
                ) : null}
              </View>

              {editingProject ? (
                <View style={styles.coverSection}>
                  <Text style={[styles.coverTitle, { color: colors.textSecondary }]}>Cover image</Text>
                  <View style={styles.coverRow}>
                    <View style={[styles.coverPreview, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
                      {projectCoverUrl(editingProject) ? (
                        <Image source={{ uri: projectCoverUrl(editingProject) ?? api.getProjectCoverImageUrl(pickNumber(editingProject, ['id'])) }} style={styles.coverImage} />
                      ) : (
                        <Text style={[styles.coverPlaceholder, { color: colors.textTertiary }]}>No cover</Text>
                      )}
                    </View>
                    <View style={styles.coverActions}>
                      <PrimaryButton
                        label={coverMutation.isPending ? 'Uploading…' : 'Upload'}
                        variant="secondary"
                        onPress={() => void coverMutation.mutateAsync(pickNumber(editingProject, ['id']))}
                        loading={coverMutation.isPending}
                      />
                      <PrimaryButton
                        label={removeCoverMutation.isPending ? 'Removing…' : 'Remove'}
                        variant="secondary"
                        onPress={() => void removeCoverMutation.mutateAsync(pickNumber(editingProject, ['id']))}
                        disabled={!pickString(editingProject, ['cover_image_filename'])}
                        loading={removeCoverMutation.isPending}
                      />
                    </View>
                  </View>
                </View>
              ) : null}

              <View style={styles.modalActions}>
                <PrimaryButton label="Cancel" variant="secondary" onPress={resetModal} />
                <PrimaryButton
                  label={editingProject ? (updateMutation.isPending ? 'Saving…' : 'Save') : (createMutation.isPending ? 'Creating…' : 'Create')}
                  onPress={() => void (editingProject ? updateMutation.mutateAsync() : createMutation.mutateAsync())}
                  disabled={!form.name.trim() || createMutation.isPending || updateMutation.isPending}
                  loading={createMutation.isPending || updateMutation.isPending}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
      <ProjectBatchPrintModal
        visible={batchProject != null}
        onClose={() => setBatchProject(null)}
        projectId={pickNumber(batchProject, ['id'])}
        projectName={pickString(batchProject, ['name'], 'Project')}
      />
    </View>
  );
}

function PressableSwatch({ color, selected, onPress }: { color: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress}>
      <View
        style={[
          styles.swatch,
          {
            backgroundColor: color,
            borderWidth: selected ? 3 : 1,
            borderColor: selected ? colors.text : colors.border,
          },
        ]}
      />
    </Pressable>
  );
}

function PressableProjectCard({
  colors,
  title,
  description,
  status,
  priority,
  dueDate,
  progress,
  budget,
  cover,
  onOpen,
  onBatchPrint,
  onEdit,
  onDelete,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  title: string;
  description: string;
  status: string;
  priority: string;
  dueDate: string;
  progress: number;
  budget: string;
  cover: string | null;
  onOpen: () => void;
  onBatchPrint: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={[styles.projectCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
      {cover ? <Image source={{ uri: cover }} style={styles.projectCover} /> : null}
      <View style={styles.projectBody}>
        <View style={styles.projectHeader}>
          <View style={styles.projectText}>
            <Text style={[styles.projectTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
            <Text style={[styles.projectDescription, { color: colors.textSecondary }]} numberOfLines={2}>{description}</Text>
          </View>
          <StatusBadge label={status} color={statusColor(status, colors)} />
        </View>

        <View style={styles.metaRow}>
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>Priority: {priority}</Text>
          {dueDate ? <Text style={[styles.metaText, { color: colors.textSecondary }]}>Due: {formatDate(dueDate)}</Text> : null}
          {budget ? <Text style={[styles.metaText, { color: colors.textSecondary }]}>Budget: {formatCurrency(budget)}</Text> : null}
        </View>

        <View style={[styles.progressTrack, { backgroundColor: colors.surfaceElevated }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.accent, width: `${Math.min(Math.max(progress, 0), 100)}%` }]} />
        </View>
        <Text style={[styles.progressText, { color: colors.textSecondary }]}>{Math.round(progress)}% complete</Text>

        <View style={styles.cardActions}>
          <PrimaryButton label="Open" variant="secondary" onPress={onOpen} />
          <PrimaryButton label="Batch Print" variant="secondary" onPress={onBatchPrint} />
          <PrimaryButton label="Edit" variant="secondary" onPress={onEdit} />
          <PrimaryButton label="Delete" variant="danger" onPress={onDelete} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: 96,
  },
  headerArea: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  projectCard: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  projectCover: {
    width: '100%',
    height: 140,
  },
  projectBody: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  projectHeader: {
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  projectText: { flex: 1, gap: spacing.xs },
  projectTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  projectDescription: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  metaRow: {
    gap: spacing.xs,
  },
  metaText: { fontSize: fontSize.sm },
  progressTrack: {
    height: 8,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  progressText: {
    fontSize: fontSize.xs,
  },
  cardActions: {
    gap: spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: borderRadius['2xl'],
    maxHeight: '92%',
  },
  modalContent: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: borderRadius.full,
  },
  splitRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  splitField: { flex: 1 },
  coverSection: { gap: spacing.sm },
  coverTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  coverRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  coverPreview: {
    width: 84,
    height: 84,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    fontSize: fontSize.xs,
  },
  coverActions: {
    flex: 1,
    gap: spacing.sm,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});
