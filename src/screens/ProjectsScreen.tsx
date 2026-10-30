import { NativeTranslation, nativeMessage, translateNative, useLocalizedMemo, useNativeLocale, useTranslation } from '@/i18n';

import { localizedStatus } from '@/utils/statusLabel';

import React, { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { RootNavigationProp } from '@/navigation/types';
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  errorCodes,
  isErrorWithCode,
  pick,
  types,
} from '@react-native-documents/picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { ActionSheetModal } from '@/components/common/ActionSheetModal';
import { FloatingActionButton, InlineTabBar, PrimaryButton, SearchBar, StatusBadge, TextField } from '@/components/common/AppUI';
import { EmptyState, ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { ProjectBatchPrintModal } from '@/components/projects/ProjectActionModals';
import { ProjectParentPicker } from '@/components/projects/ProjectParentPicker';
import { ProjectTransferActions } from '@/components/projects/ProjectTransferActions';
import { projectTree } from '@/utils/projectHierarchy';

import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import { formatDate, formatCurrency, pickNumber, pickString, statusColor, type ApiRecord } from '@/utils/data';
import { proxyThumbnailUrl } from '@/utils/media';
import { useMediaToken } from '@/hooks/useStreamToken';
import { Ellipsis } from 'lucide-react-native';

type StatusFilter = 'all' | 'active' | 'completed' | 'archived';

interface ProjectFormState {
  name: string;
  description: string;
  color: string;
  targetCount: string;
  targetPartsCount: string;
  targetSets: string;
  parentId: number | null;
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
  targetSets: '',
  parentId: null,
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
  const { token: mediaToken } = useMediaToken();
  const titleLocale = useNativeLocale();
  const { t } = useTranslation();
  const navigation = useNavigation<RootNavigationProp<'Projects'>>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: translateNative('nav.projects') });
  }, [navigation, titleLocale]);

  const { colors } = useTheme();
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingProject, setEditingProject] = useState<ApiRecord | null>(null);
  const [batchProject, setBatchProject] = useState<ApiRecord | null>(null);
  const [pendingDeleteProject, setPendingDeleteProject] = useState<ApiRecord | null>(null);
  const [form, setForm] = useState<ProjectFormState>(DEFAULT_FORM);
  const [expanded, setExpanded] = useState(new Set<number>());

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
        target_sets: form.targetSets ? Number(form.targetSets) : null,
        parent_id: form.parentId,
        url: form.url.trim() || undefined,
        tags: form.tags.trim() || undefined,
        due_date: form.dueDate || undefined,
        priority: form.priority,
        budget: form.budget.trim() ? Number(form.budget) : null,
      }),
    onSuccess: async () => {
      await invalidateProjects();
      resetModal();
      showToast(nativeMessage('native.04436e6c81ceca7e'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.ea91f938ed518cfc'), 'error'),
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
        target_sets: form.targetSets ? Number(form.targetSets) : null,
        parent_id: form.parentId,
        url: form.url.trim() || null,
        tags: form.tags.trim() || undefined,
        due_date: form.dueDate || undefined,
        priority: form.priority,
        budget: form.budget.trim() ? Number(form.budget) : null,
      }),
    onSuccess: async () => {
      await invalidateProjects();
      resetModal();
      showToast(nativeMessage('native.ad41c4498a8814e8'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.d7fb3bf7219f6906'), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteProject(id),
    onSuccess: async () => {
      await invalidateProjects();
      showToast(nativeMessage('native.9af814479d2f1915'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.53bb076551334fcb'), 'error'),
  });

  const coverMutation = useMutation({
    mutationFn: async (projectId: number) => {
      const [asset] = await pick({ type: [types.images] });
      return api.uploadProjectCoverImage(projectId, {
        uri: asset.uri,
        name: asset.name ?? 'cover-image',
        type: asset.type ?? 'image/jpeg',
      });
    },
    onSuccess: async () => {
      await invalidateProjects();
      showToast(nativeMessage('native.a001f391d7026f60'), 'success');
    },
    onError: (error: unknown) => {
      if (
        isErrorWithCode(error) &&
        error.code === errorCodes.OPERATION_CANCELED
      ) {
        return;
      }
      showToast(error instanceof Error ? error.message : nativeMessage('native.298916fc664e3b34'), 'error');
    },
  });

  const removeCoverMutation = useMutation({
    mutationFn: (projectId: number) => api.deleteProjectCoverImage(projectId),
    onSuccess: async () => {
      await invalidateProjects();
      showToast(nativeMessage('native.234e26d9c0701b32'), 'success');
    },
    onError: (error: Error) => showToast(error.message || nativeMessage('native.d1f9ecb867336a95'), 'error'),
  });

  const projects = useLocalizedMemo(() => ((projectsQuery.data ?? []) as ApiRecord[]), [projectsQuery.data]);
  const filteredProjects = useLocalizedMemo(() => {
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
      targetSets: pickString(project, ['target_sets']),
      parentId: project.parent_id == null ? null : Number(project.parent_id),
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
    return <LoadingScreen message={translateNative('native.12593164867ec279')} />;
  }

  if (projectsQuery.isError) {
    return (
      <ErrorState
        message={translateNative('native.f7c7eebeedef8716')}
        onRetry={() => void projectsQuery.refetch()}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <FlatList
        extraData={mediaToken}
        data={projectTree(projects, expanded, new Set(filteredProjects.map(project => pickNumber(project, ['id']))), !!search.trim() || filter !== 'all')}
        keyExtractor={item => pickString(item.project, ['id'])}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={ProjectsItemSeparator}
        refreshControl={
          <RefreshControl
            refreshing={projectsQuery.isRefetching}
            onRefresh={() => void projectsQuery.refetch()}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerArea}>
            <ProjectTransferActions />
            <SearchBar value={search} onChangeText={setSearch} placeholder={translateNative('native.c5813235b3b95381')} />
            <InlineTabBar
              value={filter}
              tabs={[
                { key: 'all', get label() { return translateNative('common.all'); } },
                { key: 'active', get label() { return translateNative('native.338a8c40557b22a0'); } },
                { key: 'completed', get label() { return translateNative('native.e8d25c3ab5a7be5d'); } },
                { key: 'archived', get label() { return translateNative('native.09a6280015b8766a'); } },
              ]}
              onChange={value => setFilter(value as StatusFilter)}
            />
          </View>
        }
        renderItem={({ item: { project: item, depth, hasChildren } }) => {
          const status = pickString(item, ['status'], 'active');
          const progress = Math.max(
            pickNumber(item, ['progress_percent'], 0),
            pickNumber(item, ['target_parts_count'], 0) > 0
              ? (pickNumber(item, ['completed_count'], 0) / Math.max(pickNumber(item, ['target_parts_count'], 1), 1)) * 100
              : 0,
          );
          const cover = projectCoverUrl(item);
          return (
            <View>
              {depth > 0 ? <Text style={[styles.hierarchyLabel, { color: colors.textSecondary }]}>{t('projects.nestedLevel', { defaultValue: '{{branch}} Subproject (level {{depth}})', branch: '—'.repeat(depth), depth })}</Text> : null}
              {hasChildren && !search.trim() && filter === 'all' ? <PrimaryButton
                label={expanded.has(pickNumber(item, ['id'])) ? t('projects.collapse', { defaultValue: 'Collapse subprojects' }) : t('projects.expand', { defaultValue: 'Expand subprojects' })}
                variant="secondary"
                onPress={() => setExpanded(current => {
                  const next = new Set(current);
                  const id = pickNumber(item, ['id']);
                  if (next.has(id)) next.delete(id); else next.add(id);
                  return next;
                })} /> : null}
            <PressableProjectCard
              colors={colors}
              title={pickString(item, ['name'], translateNative('native.54c922b0b8543c9f'))}
              description={pickString(item, ['description'], translateNative('native.45f0f17b62d6ee4d'))}
              status={status}
              priority={pickString(item, ['priority'], 'normal')}
              dueDate={pickString(item, ['due_date'])}
              progress={progress}
              budget={pickString(item, ['budget'])}
              cover={cover}
              onOpen={() => navigation.navigate('ProjectDetail', { id: pickNumber(item, ['id']) })}
              onBatchPrint={hasPermission('queue:create') ? () => setBatchProject(item) : undefined}
              onEdit={hasPermission('projects:update') ? () => openEdit(item) : undefined}
              onDelete={hasPermission('projects:delete') ? () => setPendingDeleteProject(item) : undefined}
            />
            </View>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon="📁"
            title={translateNative('native.51b278f9f4303cad')}
            message={translateNative('native.39ab4577b691b5a3')}
          />
        }
      />

      <ActionSheetModal
        visible={pendingDeleteProject != null}
        title={translateNative('native.551beea862b60b72')}
        subtitle={
          pendingDeleteProject
            ? translateNative('native.3e132ab74d3e7e22', { value0: String(pickString(pendingDeleteProject, ['name'])) })
            : undefined
        }
        onClose={() => setPendingDeleteProject(null)}
        actions={[
          {
            get label() { return translateNative('common.cancel'); },
            onPress: () => setPendingDeleteProject(null),
          },
          {
            get label() { return translateNative('common.delete'); },
            onPress: () => {
              if (!pendingDeleteProject) return;
              const projectId = pickNumber(pendingDeleteProject, ['id']);
              setPendingDeleteProject(null);
              void deleteMutation.mutateAsync(projectId);
            },
            destructive: true,
          },
        ]}
      />

      {hasPermission('projects:create') ? <FloatingActionButton icon="plus" label={translateNative('screen.project')} onPress={openCreate} /> : null}

      <Modal visible={showModal} animationType="slide" transparent onRequestClose={resetModal}>
        <SafeAreaProvider style={styles.container}>
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
            <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
              <Text style={[styles.modalTitle, { color: colors.text }]}>{editingProject ? translateNative('native.7ca475c44190e23e') : translateNative('native.af2769610bfa6d04')}</Text>
              <TextField label={translateNative('common.name')} value={form.name} onChangeText={value => setForm(current => ({ ...current, name: value }))} />
              <TextField label={translateNative('native.a7115fb87dd30c12')} value={form.description} onChangeText={value => setForm(current => ({ ...current, description: value }))} multiline />
              <ProjectParentPicker projects={projects} projectId={editingProject ? pickNumber(editingProject, ['id']) : undefined} value={form.parentId} onChange={parentId => setForm(current => ({ ...current, parentId }))} />
              <TextField label={t('projects.targetSets', { defaultValue: 'Target complete sets (copies per printable file)' })} value={form.targetSets} onChangeText={value => setForm(current => ({ ...current, targetSets: value.replace(/[^0-9]/g, '') }))} keyboardType="number-pad" />
              <TextField label={translateNative('native.b543b3bf7894c9d6')} value={form.url} onChangeText={value => setForm(current => ({ ...current, url: value }))} placeholder="https://…" autoCapitalize="none" />
              <TextField label={translateNative('native.0157f54b2e4d9f8e')} value={form.tags} onChangeText={value => setForm(current => ({ ...current, tags: value }))} placeholder={translateNative('native.227790e59593f50f')} />

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
                <View style={styles.splitField}><TextField label={translateNative('native.f4af58d70da07dce')} value={form.targetCount} onChangeText={value => setForm(current => ({ ...current, targetCount: value }))} keyboardType="number-pad" /></View>
                <View style={styles.splitField}><TextField label={translateNative('native.a9d4e3e17bf113f0')} value={form.targetPartsCount} onChangeText={value => setForm(current => ({ ...current, targetPartsCount: value }))} keyboardType="number-pad" /></View>
              </View>
              <View style={styles.splitRow}>
                <View style={styles.splitField}><TextField label={translateNative('native.fa33befc65b2da3f')} value={form.dueDate} onChangeText={value => setForm(current => ({ ...current, dueDate: value }))} placeholder="YYYY-MM-DD" /></View>
                <View style={styles.splitField}><TextField label={translateNative('native.047cdcc49ece4671')} value={form.priority} onChangeText={value => setForm(current => ({ ...current, priority: value }))} placeholder={translateNative('native.b7442b50e111d1b4')} /></View>
              </View>
              <View style={styles.splitRow}>
                <View style={styles.splitField}><TextField label={translateNative('native.ed03ab70dd938c3b')} value={form.budget} onChangeText={value => setForm(current => ({ ...current, budget: value }))} keyboardType="decimal-pad" /></View>
                {editingProject ? (
                  <View style={styles.splitField}><TextField label={translateNative('common.status')} value={form.status} onChangeText={value => setForm(current => ({ ...current, status: value }))} placeholder={translateNative('native.feb9c64a82d93b43')} /></View>
                ) : null}
              </View>

              {editingProject ? (
                <View style={styles.coverSection}>
                  <Text style={[styles.coverTitle, { color: colors.textSecondary }]}>{translateNative('native.94ec5d7c8c374eb1')}</Text>
                  <View style={styles.coverRow}>
                    <View style={[styles.coverPreview, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
                      {projectCoverUrl(editingProject) ? (
                        <Image source={{ uri: projectCoverUrl(editingProject) ?? api.getProjectCoverImageUrl(pickNumber(editingProject, ['id'])) }} style={styles.coverImage} />
                      ) : (
                        <Text style={[styles.coverPlaceholder, { color: colors.textTertiary }]}>{translateNative('native.4d6d2fe7d501eed7')}</Text>
                      )}
                    </View>
                    <View style={styles.coverActions}>
                      <PrimaryButton
                        label={coverMutation.isPending ? translateNative('native.d64f97c846b8193e') : translateNative('common.upload')}
                        variant="secondary"
                        onPress={() => void coverMutation.mutateAsync(pickNumber(editingProject, ['id']))}
                        loading={coverMutation.isPending}
                      />
                      <PrimaryButton
                        label={removeCoverMutation.isPending ? translateNative('native.be076aa56aabc57a') : translateNative('native.19c4ccf07e5b405d')}
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
                <PrimaryButton label={translateNative('common.cancel')} variant="secondary" onPress={resetModal} />
                <PrimaryButton
                  label={editingProject ? (updateMutation.isPending ? translateNative('native.018c2002806e2312') : translateNative('common.save')) : (createMutation.isPending ? translateNative('native.b762dfbcd3d9c0d7') : translateNative('native.8c51de8cf3b30af0'))}
                  onPress={() => void (editingProject ? updateMutation.mutateAsync() : createMutation.mutateAsync())}
                  disabled={!form.name.trim() || createMutation.isPending || updateMutation.isPending}
                  loading={createMutation.isPending || updateMutation.isPending}
                />
              </View>
            </ScrollView>
          </View>
        </SafeAreaView>
        </KeyboardAvoidingView>
        </SafeAreaProvider>
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
  useNativeLocale();
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
  onBatchPrint?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  useNativeLocale();
  const [showActions, setShowActions] = useState(false);
  return (
    <View style={[styles.projectCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}> 
      {cover ? <Image source={{ uri: cover }} style={styles.projectCover} /> : null}
      <View style={styles.projectBody}>
        <View style={styles.projectHeader}>
          <View style={styles.projectText}>
            <Text style={[styles.projectTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
            <Text style={[styles.projectDescription, { color: colors.textSecondary }]} numberOfLines={2}>{description}</Text>
          </View>
          <StatusBadge label={localizedStatus(status)} color={statusColor(status, colors)} />
        </View>

        <View style={styles.metaRow}>
          <Text style={[styles.metaText, { color: colors.textSecondary }]}><NativeTranslation id="native.c7e5d93a4a627e2a" values={{ value0: (priority) }} /></Text>
          {dueDate ? <Text style={[styles.metaText, { color: colors.textSecondary }]}><NativeTranslation id="native.74ea85a1c493da64" values={{ value0: (formatDate(dueDate)) }} /></Text> : null}
          {budget ? <Text style={[styles.metaText, { color: colors.textSecondary }]}><NativeTranslation id="native.db0af495745f6e8c" values={{ value0: (formatCurrency(budget)) }} /></Text> : null}
        </View>

        <View style={[styles.progressTrack, { backgroundColor: colors.surfaceElevated }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.accent, width: `${Math.min(Math.max(progress, 0), 100)}%` }]} />
        </View>
        <Text style={[styles.progressText, { color: colors.textSecondary }]}><NativeTranslation id="native.46c37bf4cc4fd4a3" values={{ value0: (Math.round(progress)) }} /></Text>

        <View style={styles.cardActions}>
          <View style={styles.openAction}>
            <PrimaryButton label={translateNative('native.1d02121ce21f4721')} variant="secondary" onPress={onOpen} />
          </View>
          {onBatchPrint || onEdit || onDelete ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${translateNative('nav.more')} · ${title}`}
              accessibilityState={{ expanded: showActions }}
              onPress={() => setShowActions(true)}
              style={[styles.moreAction, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
            >
              <Ellipsis size={20} color={colors.text} />
            </Pressable>
          ) : null}
        </View>
        <ActionSheetModal
          visible={showActions}
          title={title}
          onClose={() => setShowActions(false)}
          actions={[
            ...(onBatchPrint ? [{ label: translateNative('native.202e9b4ca38974dc'), onPress: () => { setShowActions(false); onBatchPrint(); } }] : []),
            ...(onEdit ? [{ label: translateNative('common.edit'), onPress: () => { setShowActions(false); onEdit(); } }] : []),
            ...(onDelete ? [{ label: translateNative('common.delete'), destructive: true, onPress: () => { setShowActions(false); onDelete(); } }] : []),
          ]}
        />
      </View>
    </View>
  );
}

function ProjectsItemSeparator() {
  useNativeLocale();
  return <View style={{ height: spacing.md }} />;
}

const styles = StyleSheet.create({
  hierarchyLabel: { paddingVertical: spacing.xs },
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  openAction: { flex: 1 },
  moreAction: { width: 48, height: 48, borderWidth: 1, borderRadius: borderRadius.lg, alignItems: 'center', justifyContent: 'center' },
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
    flexWrap: 'wrap',
    gap: spacing.md,
  },
});
