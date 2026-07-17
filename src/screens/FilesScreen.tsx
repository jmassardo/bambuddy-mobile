import React, { useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CheckCircle, ChevronDown, ChevronRight, Pause, X } from 'lucide-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { FileUploadModal } from '@/components/files/FileUploadModal';
import { Breadcrumb, FileItem } from '@/components/files/FileItem';
import {
  Chip,
  FloatingActionButton,
  PrimaryButton,
  SearchBar,
  SectionCard,
  StatCard,
  TextField,
} from '@/components/common/AppUI';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { EmptyState, ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { PrintModal } from '@/components/printers/PrintModal';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import {
  borderRadius,
  fontSize,
  fontWeight,
  spacing,
} from '@/theme/tokens';
import {
  formatDateTime,
  isRecord,
  pickArray,
  pickBoolean,
  pickId,
  pickNumber,
  pickString,
  type ApiRecord,
} from '@/utils/data';
import { formatFileSize } from '@/utils/formatters';


type FileViewMode = 'list' | 'grid';
type FileSort = 'name' | 'date' | 'size' | 'type' | 'prints';

interface FolderNode {
  id: number | null;
  name: string;
}

function ModalShell({
  visible,
  title,
  subtitle,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}> 
        <View style={[styles.modalCard, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderText}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{title}</Text>
              {subtitle ? <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
            </View>
            <Pressable onPress={onClose}>
              <X size={18} color={colors.textSecondary} strokeWidth={2} />
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

function entryName(item: ApiRecord) {
  return pickString(item, ['print_name', 'filename', 'name'], 'Untitled');
}

function isFolderEntry(item: ApiRecord) {
  return pickBoolean(item, ['is_folder'], pickString(item, ['type', 'kind']) === 'folder');
}

function isReadmeFile(item: ApiRecord) {
  return !isFolderEntry(item) && /^readme\.md$/i.test(pickString(item, ['filename', 'name']));
}

function sortEntries(entries: ApiRecord[], sort: FileSort) {
  const copy = [...entries];
  copy.sort((a, b) => {
    switch (sort) {
      case 'date':
        return new Date(pickString(b, ['updated_at', 'created_at', 'modified_at'])).getTime() - new Date(pickString(a, ['updated_at', 'created_at', 'modified_at'])).getTime();
      case 'size':
        return pickNumber(b, ['file_size', 'size', 'size_bytes']) - pickNumber(a, ['file_size', 'size', 'size_bytes']);
      case 'type':
        return pickString(a, ['file_type', 'type']).localeCompare(pickString(b, ['file_type', 'type']));
      case 'prints':
        return pickNumber(b, ['print_count']) - pickNumber(a, ['print_count']);
      default:
        return entryName(a).localeCompare(entryName(b));
    }
  });
  return copy;
}

export default function FilesScreen() {
  const navigation = useNavigation<any>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Files' });
  }, [navigation]);

  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [folderStack, setFolderStack] = useState<FolderNode[]>([{ id: null, name: 'Library' }]);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<FileViewMode>('list');
  const [sortBy, setSortBy] = useState<FileSort>('name');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [trashMode, setTrashMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [renameItem, setRenameItem] = useState<ApiRecord | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [previewItem, setPreviewItem] = useState<ApiRecord | null>(null);
  const [moveIds, setMoveIds] = useState<number[]>([]);
  const [deleteIds, setDeleteIds] = useState<number[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [printFileId, setPrintFileId] = useState<number | null>(null);
  const [showExternalFolderModal, setShowExternalFolderModal] = useState(false);
  const [externalFolderName, setExternalFolderName] = useState('');
  const [externalFolderPath, setExternalFolderPath] = useState('');
  const [externalFolderReadonly, setExternalFolderReadonly] = useState(true);
  const [pendingExternalFolderDelete, setPendingExternalFolderDelete] = useState<ApiRecord | null>(null);
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [purgeDays, setPurgeDays] = useState(90);
  const [includeNeverPrinted, setIncludeNeverPrinted] = useState(true);
  const [showTagFilterModal, setShowTagFilterModal] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [tagEditorFileIds, setTagEditorFileIds] = useState<number[]>([]);
  const [tagEditorSelectedIds, setTagEditorSelectedIds] = useState<number[]>([]);
  const [tagDraftName, setTagDraftName] = useState('');
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [pendingTagDelete, setPendingTagDelete] = useState<ApiRecord | null>(null);
  const [readmeExpanded, setReadmeExpanded] = useState(true);
  const currentFolder = folderStack[folderStack.length - 1];

  const filesQuery = useQuery({
    queryKey: ['libraryFiles', currentFolder.id ?? 'root'],
    queryFn: () =>
      currentFolder.id != null
        ? api.getLibraryFiles(currentFolder.id)
        : api.getLibraryFiles(undefined, false),
    enabled: !trashMode,
  });
  const foldersQuery = useQuery({
    queryKey: ['libraryFolders'],
    queryFn: () => api.getLibraryFolders(),
    enabled: !trashMode,
  });
  const trashQuery = useQuery({
    queryKey: ['libraryTrash'],
    queryFn: () => api.getLibraryTrash(),
    enabled: trashMode,
  });
  const tagsQuery = useQuery({
    queryKey: ['libraryTags'],
    queryFn: () => api.getLibraryTags(),
  });
  const externalFoldersQuery = useQuery({
    queryKey: ['externalFolders'],
    queryFn: () => api.getExternalFolders(),
    enabled: !trashMode,
  });
  const libraryPurgePreviewQuery = useQuery({
    queryKey: ['libraryPurgePreview', purgeDays, includeNeverPrinted],
    queryFn: () => api.previewLibraryPurge(purgeDays, includeNeverPrinted),
    enabled: showPurgeModal,
  });
  const pendingUploadsQuery = useQuery({
    queryKey: ['pendingUploads'],
    queryFn: () => api.getPendingUploads(),
  });
  const previewPlatesQuery = useQuery({
    queryKey: ['libraryFilePlates', previewItem ? Number(pickId(previewItem)) : null],
    queryFn: () => api.getLibraryFilePlates(Number(pickId(previewItem))),
    enabled: previewItem !== null && !isFolderEntry(previewItem),
  });

  // Flatten the recursive folder tree to find children of the current folder
  const childFolders = useMemo(() => {
    const tree = foldersQuery.data;
    if (!Array.isArray(tree)) return [];
    const parentId = currentFolder.id;
    // Recursively collect all folders, then filter to children of parentId
    const flatten = (nodes: Record<string, unknown>[]): Record<string, unknown>[] =>
      nodes.flatMap(n => [n, ...flatten(pickArray(n, ['children']).filter(isRecord))]);
    const all = flatten(tree.filter(isRecord));
    return all.filter(f => {
      const pid = f.parent_id;
      return parentId == null ? pid == null : pid === parentId;
    });
  }, [foldersQuery.data, currentFolder.id]);

  const entries = useMemo(() => {
    if (trashMode) {
      const source = Array.isArray(trashQuery.data) ? trashQuery.data : [];
      return source.filter(isRecord);
    }
    const files = Array.isArray(filesQuery.data) ? filesQuery.data.filter(isRecord) : [];
    // Convert folder tree items into folder entries compatible with the file list
    const folderEntries: ApiRecord[] = childFolders.map(f => ({
      ...f,
      is_folder: true,
      type: 'folder',
      filename: pickString(f, ['name'], 'Folder'),
      name: pickString(f, ['name'], 'Folder'),
    }));
    return [...folderEntries, ...files];
  }, [filesQuery.data, trashMode, trashQuery.data, childFolders]);

  const readmeFile = useMemo(
    () => entries.find(isReadmeFile) ?? null,
    [entries],
  );
  const readmeFileId = readmeFile ? Number(pickId(readmeFile)) : null;

  const readmeQuery = useQuery({
    queryKey: ['libraryReadme', readmeFileId],
    queryFn: () => api.getLibraryFileText(readmeFileId as number),
    enabled: !trashMode && readmeFileId != null,
  });

  const fileTypes = useMemo(() => {
    const values = new Set<string>();
    entries.forEach(item => {
      if (!isFolderEntry(item)) values.add(pickString(item, ['file_type', 'type'], 'file'));
    });
    return Array.from(values).sort();
  }, [entries]);

  const tagCatalog = useMemo(
    () => (Array.isArray(tagsQuery.data) ? tagsQuery.data.filter(isRecord) : []),
    [tagsQuery.data],
  );
  const selectedTagNames = useMemo(
    () => tagCatalog.filter(tag => selectedTagIds.includes(pickNumber(tag, ['id']))),
    [selectedTagIds, tagCatalog],
  );
  const externalFolders = useMemo(
    () => (Array.isArray(externalFoldersQuery.data) ? externalFoldersQuery.data.filter(isRecord) : []),
    [externalFoldersQuery.data],
  );

  React.useEffect(() => {
    setReadmeExpanded(true);
  }, [currentFolder.id, readmeFileId]);

  const filteredEntries = useMemo(() => {
    const term = search.trim().toLowerCase();
    let result = entries.filter(item => {
      if (typeFilter !== 'all' && !isFolderEntry(item)) {
        if (pickString(item, ['file_type', 'type']) !== typeFilter) return false;
      }
      if (selectedTagIds.length > 0) {
        if (isFolderEntry(item)) return false;
        const itemTagIds = pickArray(item, ['tags'])
          .filter(isRecord)
          .map(tag => pickNumber(tag, ['id']))
          .filter(Boolean);
        if (!selectedTagIds.every(tagId => itemTagIds.includes(tagId))) return false;
      }
      if (!term) return true;
      const haystack = [
        entryName(item),
        pickString(item, ['filename', 'name']),
        pickString(item, ['created_by_username']),
        pickString(item, ['sliced_for_model']),
        ...pickArray(item, ['tags']).filter(isRecord).map(tag => pickString(tag, ['name'])),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });

    const folders = sortEntries(result.filter(isFolderEntry), sortBy);
    const files = sortEntries(result.filter(item => !isFolderEntry(item)), sortBy);
    return [...folders, ...files];
  }, [entries, search, selectedTagIds, sortBy, typeFilter]);

  const visibleFolders = useMemo(
    () => filteredEntries.filter(isFolderEntry),
    [filteredEntries],
  );

  const fileStats = useMemo(() => {
    const folders = entries.filter(isFolderEntry).length;
    const files = entries.length - folders;
    const totalSize = entries.reduce(
      (sum, item) => sum + pickNumber(item, ['file_size', 'size', 'size_bytes'], 0),
      0,
    );
    return { folders, files, totalSize };
  }, [entries]);

  const rootFolders = useMemo(() => {
    const tree = foldersQuery.data;
    if (!Array.isArray(tree)) return [];
    // Top-level folders (parent_id is null) as folder entries
    return tree.filter(isRecord).filter(f => f.parent_id == null).map(f => ({
      ...f,
      is_folder: true,
      type: 'folder',
      filename: pickString(f, ['name'], 'Folder'),
      name: pickString(f, ['name'], 'Folder'),
    }));
  }, [foldersQuery.data]);

  const moveTargets = useMemo(() => {
    const targets: Array<{ id: number | null; name: string }> = [{ id: null, name: 'Library root' }];
    folderStack.forEach(node => {
      if (node.id !== null) targets.push(node);
    });
    rootFolders.forEach(folder => {
      const id = Number(pickId(folder));
      if (!targets.some(target => target.id === id)) {
        targets.push({ id, name: pickString(folder, ['name', 'filename'], `Folder ${id}`) });
      }
    });
    visibleFolders.forEach(folder => {
      const id = Number(pickId(folder));
      if (!targets.some(target => target.id === id)) {
        targets.push({ id, name: pickString(folder, ['name', 'filename'], `Folder ${id}`) });
      }
    });
    return targets;
  }, [folderStack, rootFolders, visibleFolders]);

  const refreshActive = async () => {
    await Promise.all([
      trashMode ? trashQuery.refetch() : filesQuery.refetch(),
      foldersQuery.refetch(),
      tagsQuery.refetch(),
      pendingUploadsQuery.refetch(),
    ]);
  };

  const invalidateFiles = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['libraryFiles'] }),
      queryClient.invalidateQueries({ queryKey: ['libraryFolders'] }),
      queryClient.invalidateQueries({ queryKey: ['libraryTrash'] }),
      queryClient.invalidateQueries({ queryKey: ['libraryTags'] }),
      queryClient.invalidateQueries({ queryKey: ['externalFolders'] }),
      queryClient.invalidateQueries({ queryKey: ['pendingUploads'] }),
    ]);
  };

  const createFolderMutation = useMutation({
    mutationFn: (name: string) => api.createFolder({ name, parent_id: currentFolder.id ?? undefined }),
    onSuccess: async () => {
      await invalidateFiles();
      setShowNewFolder(false);
      setNewFolderName('');
      showToast('Folder created.', 'success');
    },
    onError: () => showToast('Unable to create folder.', 'error'),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => api.renameLibraryItem(id, name),
    onSuccess: async () => {
      await invalidateFiles();
      setRenameItem(null);
      setRenameValue('');
      showToast('Item renamed.', 'success');
    },
    onError: () => showToast('Unable to rename the item.', 'error'),
  });

  const moveMutation = useMutation({
    mutationFn: async ({ ids, targetId }: { ids: number[]; targetId: number | null }) => {
      for (const id of ids) {
        await api.moveLibraryItem(id, targetId);
      }
    },
    onSuccess: async () => {
      await invalidateFiles();
      setSelectedIds([]);
      setMoveIds([]);
      showToast('Items moved.', 'success');
    },
    onError: () => showToast('Unable to move the selected items.', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (ids: number[]) => api.bulkDeleteLibrary(ids, []),
    onSuccess: async () => {
      await invalidateFiles();
      setDeleteIds([]);
      setSelectedIds([]);
      showToast('Items deleted.', 'success');
    },
    onError: () => showToast('Unable to delete the selected items.', 'error'),
  });

  const addToQueueMutation = useMutation({
    mutationFn: (ids: number[]) => api.addLibraryFilesToQueue(ids),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['queue'] });
      setSelectedIds([]);
      showToast('Selected files added to the queue.', 'success');
    },
    onError: () => showToast('Unable to add the selected files to the queue.', 'error'),
  });

  const restoreMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      for (const id of ids) {
        await api.restoreLibraryItem(id);
      }
    },
    onSuccess: async () => {
      await invalidateFiles();
      showToast('Item restored from trash.', 'success');
    },
    onError: () => showToast('Unable to restore the item.', 'error'),
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      for (const id of ids) {
        await api.permanentDeleteLibraryItem(id);
      }
    },
    onSuccess: async () => {
      await invalidateFiles();
      showToast('Item permanently deleted.', 'success');
    },
    onError: () => showToast('Unable to permanently delete the item.', 'error'),
  });

  const emptyTrashMutation = useMutation({
    mutationFn: () => api.emptyLibraryTrash(),
    onSuccess: async () => {
      await invalidateFiles();
      showToast('Trash emptied.', 'success');
    },
    onError: () => showToast('Unable to empty trash.', 'error'),
  });

  const createExternalFolderMutation = useMutation({
    mutationFn: () =>
      api.createExternalFolder({
        name: externalFolderName.trim(),
        external_path: externalFolderPath.trim(),
        readonly: externalFolderReadonly,
      }),
    onSuccess: async () => {
      await invalidateFiles();
      setShowExternalFolderModal(false);
      setExternalFolderName('');
      setExternalFolderPath('');
      setExternalFolderReadonly(true);
      showToast('External folder added.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to add the external folder.', 'error'),
  });

  const deleteExternalFolderMutation = useMutation({
    mutationFn: (id: number) => api.deleteExternalFolder(id),
    onSuccess: async () => {
      await invalidateFiles();
      setPendingExternalFolderDelete(null);
      showToast('External folder removed.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to remove the external folder.', 'error'),
  });

  const scanExternalFolderMutation = useMutation({
    mutationFn: (id: number) => api.scanExternalFolder(id),
    onSuccess: async () => {
      await invalidateFiles();
      showToast('External folder synced.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to sync the external folder.', 'error'),
  });

  const purgeOldFilesMutation = useMutation({
    mutationFn: () => api.purgeLibraryOldFiles({ older_than_days: purgeDays, include_never_printed: includeNeverPrinted }),
    onSuccess: async () => {
      await invalidateFiles();
      setShowPurgeModal(false);
      showToast('Old files moved to trash.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to purge old files.', 'error'),
  });

  const saveTagMutation = useMutation({
    mutationFn: () =>
      editingTagId != null
        ? api.updateLibraryTag(editingTagId, tagDraftName.trim())
        : api.createLibraryTag(tagDraftName.trim()),
    onSuccess: async () => {
      await invalidateFiles();
      setEditingTagId(null);
      setTagDraftName('');
      showToast(editingTagId != null ? 'Tag updated.' : 'Tag created.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to save the tag.', 'error'),
  });

  const deleteTagMutation = useMutation({
    mutationFn: (id: number) => api.deleteLibraryTag(id),
    onSuccess: async (_data, id) => {
      await invalidateFiles();
      setPendingTagDelete(null);
      setSelectedTagIds(current => current.filter(tagId => tagId !== id));
      setTagEditorSelectedIds(current => current.filter(tagId => tagId !== id));
      showToast('Tag deleted.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to delete the tag.', 'error'),
  });

  const assignTagsMutation = useMutation({
    mutationFn: () => api.bulkAssignLibraryTags(tagEditorFileIds, tagEditorSelectedIds, 'replace'),
    onSuccess: async () => {
      await invalidateFiles();
      setTagEditorFileIds([]);
      showToast('File tags updated.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to update file tags.', 'error'),
  });

  const toggleSelected = (id: number) => {
    setSelectedIds(current =>
      current.includes(id) ? current.filter(value => value !== id) : [...current, id],
    );
  };

  const openEntry = (item: ApiRecord) => {
    if (trashMode) return;
    const id = Number(pickId(item));
    if (selectionMode && !isFolderEntry(item)) {
      toggleSelected(id);
      return;
    }
    if (isFolderEntry(item)) {
      setFolderStack(current => [
        ...current,
        { id: id, name: pickString(item, ['name', 'filename'], 'Folder') },
      ]);
      return;
    }
    setPreviewItem(item);
  };

  const toggleTagFilter = (tagId: number) => {
    setSelectedTagIds(current =>
      current.includes(tagId) ? current.filter(value => value !== tagId) : [...current, tagId],
    );
  };

  const openTagEditor = (ids: number[]) => {
    const files = entries.filter(item => ids.includes(Number(pickId(item))) && !isFolderEntry(item));
    const commonTagIds = tagCatalog
      .filter(tag =>
        files.length > 0 &&
        files.every(file =>
          pickArray(file, ['tags'])
            .filter(isRecord)
            .some(fileTag => pickNumber(fileTag, ['id']) === pickNumber(tag, ['id'])),
        ),
      )
      .map(tag => pickNumber(tag, ['id']))
      .filter(Boolean);
    setTagEditorFileIds(ids);
    setTagEditorSelectedIds(commonTagIds);
  };

  if (!trashMode && filesQuery.isLoading && !filesQuery.data) {
    return <LoadingScreen message="Loading files…" />;
  }

  if (trashMode && trashQuery.isLoading && !trashQuery.data) {
    return <LoadingScreen message="Loading trash…" />;
  }

  if ((!trashMode && filesQuery.isError) || (trashMode && trashQuery.isError)) {
    return (
      <ErrorState
        message={trashMode ? 'Unable to load the library trash.' : 'Unable to load your file library.'}
        onRetry={() => {
          refreshActive();
        }}
      />
    );
  }

  const selectionMode = !trashMode && selectedIds.length > 0;
  const selectionCount = selectedIds.length;
  const pendingUploads = Array.isArray(pendingUploadsQuery.data)
    ? pendingUploadsQuery.data.filter(isRecord)
    : [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <FlatList
        key={viewMode}
        data={filteredEntries}
        keyExtractor={item => `${trashMode ? 'trash' : 'file'}-${pickId(item)}`}
        numColumns={!trashMode && viewMode === 'grid' ? 2 : 1}
        renderItem={({ item }) => {
          if (trashMode) {
            const id = Number(pickId(item));
            return (
              <View style={styles.trashItemWrap}>
                <SectionCard title={pickString(item, ['filename', 'name'], 'Deleted item')} subtitle={`Deleted ${formatDateTime(pickString(item, ['deleted_at', 'created_at']))}`}>
                  <Text style={[styles.trashMeta, { color: colors.textSecondary }]}>Auto purge {formatDateTime(pickString(item, ['auto_purge_at']))}</Text>
                  <Text style={[styles.trashMeta, { color: colors.textSecondary }]}>Folder {pickString(item, ['folder_name'], 'Library')}</Text>
                  <Text style={[styles.trashMeta, { color: colors.textSecondary }]}>{formatFileSize(pickNumber(item, ['file_size']))}</Text>
                  <View style={styles.trashActions}>
                    <PrimaryButton label="Restore" onPress={() => {
                      restoreMutation.mutate([id]);
                    }} />
                    <PrimaryButton label="Delete" variant="danger" onPress={() => {
                      permanentDeleteMutation.mutate([id]);
                    }} />
                  </View>
                </SectionCard>
              </View>
            );
          }

          const id = Number(pickId(item));
          return (
            <View style={[styles.fileCell, viewMode === 'grid' ? styles.gridCell : styles.listCell]}>
              <FileItem
                item={item}
                viewMode={viewMode}
                selected={selectedIds.includes(id)}
                showSelection={selectionMode && !isFolderEntry(item)}
                onPress={() => openEntry(item)}
                onLongPress={() => {
                  if (isFolderEntry(item)) return;
                  if (selectionMode) {
                    toggleSelected(id);
                    return;
                  }
                  setSelectedIds([id]);
                }}
                onToggleSelect={() => toggleSelected(id)}
                onRename={() => {
                  setRenameItem(item);
                  setRenameValue(pickString(item, ['filename', 'name'], ''));
                }}
                onDelete={() => {
                  setDeleteIds([id]);
                }}
                onMove={() => setMoveIds([id])}
                onDownload={() => {
                  if (isFolderEntry(item)) return;
                  const downloadUrl = api.getLibraryFileDownloadUrl(id);
                  Linking.openURL(downloadUrl).catch(() => {
                    showToast('Could not open download link.', 'error');
                  });
                }}
                onPreview={() => setPreviewItem(item)}
                onSlice={() => showToast('Slicing presets and execution are only available in the web UI for now.', 'warning')}
              />
            </View>
          );
        }}
        contentContainerStyle={styles.content}
        columnWrapperStyle={!trashMode && viewMode === 'grid' ? styles.gridRow : undefined}
        refreshControl={
          <RefreshControl
            refreshing={
              trashMode
                ? trashQuery.isRefetching
                : filesQuery.isRefetching || pendingUploadsQuery.isRefetching
            }
            onRefresh={() => {
              refreshActive();
            }}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerStack}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}>
              <StatCard label={trashMode ? 'Trash items' : 'Files'} value={String(fileStats.files)} helper={trashMode ? 'Deleted library files' : 'Current folder'} />
              <StatCard label="Folders" value={String(fileStats.folders)} helper="Current folder" />
              <StatCard label="Size" value={formatFileSize(fileStats.totalSize)} helper="Visible items" />
              <StatCard label="Tags" value={String(Array.isArray(tagsQuery.data) ? tagsQuery.data.length : 0)} helper="Library catalog" />
              <StatCard label="Pending uploads" value={String(pendingUploads.length)} helper="Server queue" />
            </ScrollView>

            <SectionCard title={trashMode ? 'Library trash' : 'File manager'} subtitle={trashMode ? 'Recover or permanently delete files from trash.' : 'Folder navigation, upload, file actions, and web-style metadata in one mobile view.'}>
              {!trashMode ? (
                <Breadcrumb
                  path={folderStack}
                  onNavigate={index => {
                    setFolderStack(current => current.slice(0, index + 1));
                    setSelectedIds([]);
                  }}
                />
              ) : null}
              <SearchBar
                value={search}
                onChangeText={setSearch}
                placeholder={trashMode ? 'Search trash by filename' : 'Search files, folders, uploader, or profile'}
                onFilterPress={trashMode ? undefined : () => setShowTagFilterModal(true)}
              />
              {!trashMode && selectedTagNames.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                  {selectedTagNames.map(tag => (
                    <Chip
                      key={pickNumber(tag, ['id'])}
                      label={`Tag: ${pickString(tag, ['name'])}`}
                      selected
                      onPress={() => toggleTagFilter(pickNumber(tag, ['id']))}
                    />
                  ))}
                  <Chip label="Clear tag filters" selected={false} onPress={() => setSelectedTagIds([])} />
                </ScrollView>
              ) : null}
              {!trashMode && visibleFolders.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.folderRow}>
                  {visibleFolders.map(folder => (
                    <Chip
                      key={pickId(folder)}
                      label={pickString(folder, ['name', 'filename'], 'Folder')}
                      selected={false}
                      onPress={() => openEntry(folder)}
                    />
                  ))}
                </ScrollView>
              ) : null}
              {!trashMode ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                  <Chip label="All types" selected={typeFilter === 'all'} onPress={() => setTypeFilter('all')} />
                  {fileTypes.map(type => (
                    <Chip
                      key={type}
                      label={type.toUpperCase()}
                      selected={typeFilter === type}
                      onPress={() => setTypeFilter(type)}
                    />
                  ))}
                </ScrollView>
              ) : null}
              {!trashMode ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                  {(['name', 'date', 'size', 'type', 'prints'] as FileSort[]).map(sort => (
                    <Chip
                      key={sort}
                      label={`Sort: ${sort}`}
                      selected={sortBy === sort}
                      onPress={() => setSortBy(sort)}
                    />
                  ))}
                </ScrollView>
              ) : null}
              <View style={styles.headerActions}>
                <PrimaryButton
                  label={viewMode === 'grid' ? 'List view' : 'Grid view'}
                  variant="secondary"
                  onPress={() => setViewMode(current => (current === 'grid' ? 'list' : 'grid'))}
                  disabled={trashMode}
                />
                <PrimaryButton
                  label="Upload"
                  onPress={() => {
                    setShowUploadModal(true);
                  }}
                  disabled={trashMode}
                />
                <PrimaryButton
                  label="New folder"
                  variant="secondary"
                  onPress={() => setShowNewFolder(true)}
                  disabled={trashMode}
                />
                <PrimaryButton
                  label="Tags"
                  variant="secondary"
                  onPress={() => setShowTagFilterModal(true)}
                  disabled={trashMode}
                />
                <PrimaryButton
                  label="Purge old"
                  variant="secondary"
                  onPress={() => setShowPurgeModal(true)}
                  disabled={trashMode}
                />
                <PrimaryButton
                  label="External folders"
                  variant="secondary"
                  onPress={() => setShowExternalFolderModal(true)}
                  disabled={trashMode}
                />
                <PrimaryButton
                  label={trashMode ? 'Back to files' : 'Open trash'}
                  variant="secondary"
                  onPress={() => {
                    setTrashMode(current => !current);
                    setSelectedIds([]);
                  }}
                />
                {trashMode ? (
                  <PrimaryButton
                    label="Empty trash"
                    variant="danger"
                    onPress={() => {
                      emptyTrashMutation.mutate();
                    }}
                    disabled={emptyTrashMutation.isPending || entries.length === 0}
                  />
                ) : null}
              </View>
              {pendingUploads.length > 0 ? (
                <View style={[styles.pendingUploads, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
                  <Text style={[styles.pendingUploadsTitle, { color: colors.text }]}>Pending uploads</Text>
                  <Text style={[styles.pendingUploadsText, { color: colors.textSecondary }]}>
                    {pendingUploads.length} file{pendingUploads.length === 1 ? '' : 's'} still processing on the server.
                  </Text>
                </View>
              ) : null}
            </SectionCard>

            {!trashMode ? (
              <SectionCard
                title="External folders"
                subtitle="Linked folders stay visible in the mobile file manager and can be synced on demand."
              >
                {externalFolders.length > 0 ? (
                  externalFolders.map(folder => (
                    <View
                      key={pickId(folder)}
                      style={[styles.externalFolderRow, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                    >
                      <View style={styles.externalFolderText}>
                        <Text style={[styles.externalFolderTitle, { color: colors.text }]}>{pickString(folder, ['name'], 'External folder')}</Text>
                        <Text style={[styles.externalFolderMeta, { color: colors.textSecondary }]} numberOfLines={2}>
                          {pickString(folder, ['external_path'], 'No path')}
                        </Text>
                        <Text style={[styles.externalFolderMeta, { color: colors.textSecondary }]}> 
                          {pickBoolean(folder, ['external_readonly']) ? 'Read only' : 'Writable'}
                        </Text>
                      </View>
                      <View style={styles.rowActionWrap}>
                        <PrimaryButton
                          label="Sync"
                          variant="secondary"
                          onPress={() => void scanExternalFolderMutation.mutateAsync(Number(pickId(folder)))}
                          disabled={scanExternalFolderMutation.isPending}
                        />
                        <PrimaryButton
                          label="Delete"
                          variant="danger"
                          onPress={() => setPendingExternalFolderDelete(folder)}
                        />
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={[styles.pendingUploadsText, { color: colors.textSecondary }]}>No external folders added yet.</Text>
                )}
              </SectionCard>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon={trashMode ? '🗑️' : '📁'}
            title={trashMode ? 'Trash is empty' : 'This folder is empty'}
            message={trashMode ? 'Deleted files will appear here until you restore or purge them.' : 'Upload files, create a new folder, or browse into a different folder.'}
          />
        }
        ListFooterComponent={
          !trashMode && readmeFile ? (
            <SectionCard
              title="README"
              subtitle={pickString(readmeFile, ['filename', 'name'], 'README.md')}
              right={(
                <Pressable style={styles.readmeToggle} onPress={() => setReadmeExpanded(current => !current)}>
                  <Text style={[styles.previewLine, { color: colors.accentLight }]}>
                    {readmeExpanded ? 'Hide' : 'Show'}
                  </Text>
                  {readmeExpanded ? (
                    <ChevronDown size={18} color={colors.accentLight} strokeWidth={2} />
                  ) : (
                    <ChevronRight size={18} color={colors.accentLight} strokeWidth={2} />
                  )}
                </Pressable>
              )}
            >
              {readmeExpanded ? (
                readmeQuery.isLoading ? (
                  <Text style={[styles.readmeText, { color: colors.textSecondary }]}>Loading README…</Text>
                ) : readmeQuery.isError ? (
                  <Text style={[styles.readmeText, { color: colors.error }]}>Unable to load this README.</Text>
                ) : (
                  <Text style={[styles.readmeText, { color: colors.text }]}>
                    {(readmeQuery.data ?? '').trim() || 'This README is empty.'}
                  </Text>
                )
              ) : null}
            </SectionCard>
          ) : null
        }
      />

      {!trashMode && selectionCount > 0 ? (
        <View style={[styles.selectionBar, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectionActions}>
            <Text style={[styles.selectionText, { color: colors.text }]}>{selectionCount} selected</Text>
            <PrimaryButton label="Move" variant="secondary" onPress={() => setMoveIds(selectedIds)} />
            <PrimaryButton label="Tags" variant="secondary" onPress={() => openTagEditor(selectedIds)} />
            <PrimaryButton
              label={addToQueueMutation.isPending ? 'Adding…' : 'Add to Queue'}
              onPress={() => {
                void addToQueueMutation.mutateAsync(selectedIds);
              }}
              disabled={addToQueueMutation.isPending}
            />
            <PrimaryButton label="Delete" variant="danger" onPress={() => setDeleteIds(selectedIds)} />
            <PrimaryButton label="Done" variant="secondary" onPress={() => setSelectedIds([])} />
          </ScrollView>
        </View>
      ) : null}

      <ModalShell
        visible={showNewFolder}
        title="New folder"
        subtitle="Create a subfolder inside the current location."
        onClose={() => setShowNewFolder(false)}
      >
        <TextField
          label="Folder name"
          value={newFolderName}
          onChangeText={setNewFolderName}
          placeholder="Projects"
        />
        <View style={styles.modalFooter}>
          <PrimaryButton label="Cancel" variant="secondary" onPress={() => setShowNewFolder(false)} />
          <PrimaryButton
            label={createFolderMutation.isPending ? 'Creating…' : 'Create'}
            onPress={() => {
              createFolderMutation.mutate(newFolderName.trim());
            }}
            disabled={!newFolderName.trim() || createFolderMutation.isPending}
          />
        </View>
      </ModalShell>

      <ModalShell
        visible={renameItem !== null}
        title="Rename item"
        subtitle="Rename files or folders from mobile, matching the web file manager controls."
        onClose={() => setRenameItem(null)}
      >
        <TextField label="New name" value={renameValue} onChangeText={setRenameValue} placeholder="Updated name" />
        <View style={styles.modalFooter}>
          <PrimaryButton label="Cancel" variant="secondary" onPress={() => setRenameItem(null)} />
          <PrimaryButton
            label={renameMutation.isPending ? 'Saving…' : 'Save'}
            onPress={() => {
              if (!renameItem) return;
              renameMutation.mutate({ id: Number(pickId(renameItem)), name: renameValue.trim() });
            }}
            disabled={!renameValue.trim() || renameMutation.isPending}
          />
        </View>
      </ModalShell>

      <ModalShell
        visible={moveIds.length > 0}
        title="Move items"
        subtitle="Choose a destination folder from the current path or the library root."
        onClose={() => setMoveIds([])}
      >
        <ScrollView style={styles.modalScroll}>
          {moveTargets.map(target => (
            <Pressable
              key={`${target.id ?? 'root'}-${target.name}`}
              onPress={() => {
                moveMutation.mutate({ ids: moveIds, targetId: target.id });
              }}
              style={[styles.moveTarget, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
            >
              <Text style={[styles.moveTargetTitle, { color: colors.text }]}>{target.name}</Text>
              <Text style={[styles.moveTargetSubtitle, { color: colors.textSecondary }]}>
                {target.id === currentFolder.id ? 'Current folder' : target.id === null ? 'Top level' : `Folder #${target.id}`}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.modalFooter}>
          <PrimaryButton label="Close" variant="secondary" onPress={() => setMoveIds([])} />
        </View>
      </ModalShell>

      <ModalShell
        visible={previewItem !== null}
        title={previewItem ? entryName(previewItem) : 'Preview'}
        subtitle="Model viewer, file details, and plate metadata in a mobile-friendly sheet."
        onClose={() => setPreviewItem(null)}
      >
        {previewItem ? (
          <ScrollView style={styles.modalScroll}>
            <SectionCard title="File details" subtitle="Size, date, type, upload owner, print count, and slicing metadata.">
              <Text style={[styles.previewLine, { color: colors.text }]}>Filename: {pickString(previewItem, ['filename', 'name'], 'Unknown')}</Text>
              <Text style={[styles.previewLine, { color: colors.text }]}>Type: {pickString(previewItem, ['file_type', 'type'], 'file').toUpperCase()}</Text>
              <Text style={[styles.previewLine, { color: colors.text }]}>Size: {formatFileSize(pickNumber(previewItem, ['file_size', 'size', 'size_bytes']))}</Text>
              <Text style={[styles.previewLine, { color: colors.text }]}>Updated: {formatDateTime(pickString(previewItem, ['updated_at', 'created_at', 'modified_at']))}</Text>
              <Text style={[styles.previewLine, { color: colors.text }]}>Uploader: {pickString(previewItem, ['created_by_username'], 'Unknown')}</Text>
              <Text style={[styles.previewLine, { color: colors.text }]}>Prints: {pickNumber(previewItem, ['print_count'], 0)}</Text>
              {pickString(previewItem, ['sliced_for_model']) ? (
                <Text style={[styles.previewLine, { color: colors.text }]}>Sliced for: {pickString(previewItem, ['sliced_for_model'])}</Text>
              ) : null}
            </SectionCard>

            {!isFolderEntry(previewItem) ? (
              <SectionCard title="Tags" subtitle="Manage tag assignments for this file.">
                {pickArray(previewItem, ['tags']).filter(isRecord).length > 0 ? (
                  <View style={styles.previewTags}>
                    {pickArray(previewItem, ['tags']).filter(isRecord).map(tag => (
                      <Chip
                        key={pickNumber(tag, ['id'])}
                        label={pickString(tag, ['name'], 'Tag')}
                        selected={false}
                        onPress={() => {
                          setSelectedTagIds([pickNumber(tag, ['id'])]);
                          setShowTagFilterModal(true);
                        }}
                      />
                    ))}
                  </View>
                ) : (
                  <Text style={[styles.previewLine, { color: colors.textSecondary }]}>No tags assigned yet.</Text>
                )}
                <PrimaryButton
                  label="Edit file tags"
                  variant="secondary"
                  onPress={() => openTagEditor([Number(pickId(previewItem))])}
                />
              </SectionCard>
            ) : null}

            {previewPlatesQuery.data && isRecord(previewPlatesQuery.data) ? (
              <SectionCard title="Plate previews" subtitle="Multi-plate 3MF and sliced files expose plate metadata similar to web previews.">
                {pickArray(previewPlatesQuery.data, ['plates']).length > 0 ? (
                  pickArray(previewPlatesQuery.data, ['plates']).filter(isRecord).map(plate => (
                    <View key={pickString(plate, ['index'], Math.random().toString())} style={[styles.plateRow, { borderColor: colors.borderSubtle }]}> 
                      <Text style={[styles.previewLine, { color: colors.text }]}>Plate {pickString(plate, ['index'], '?')}: {pickString(plate, ['name'], 'Unnamed')}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={[styles.previewLine, { color: colors.textSecondary }]}>No separate plates were reported for this file.</Text>
                )}
              </SectionCard>
            ) : null}

            {!isFolderEntry(previewItem) && /(\.3mf|\.gcode(\.3mf)?)$/i.test(pickString(previewItem, ['filename', 'name'])) ? (
              <PrimaryButton
                label="Print this file"
                onPress={() => {
                  setPreviewItem(null);
                  setPrintFileId(Number(pickId(previewItem)));
                }}
              />
            ) : null}
          </ScrollView>
        ) : null}
        <View style={styles.modalFooter}>
          <PrimaryButton label="Close" variant="secondary" onPress={() => setPreviewItem(null)} />
        </View>
      </ModalShell>

      {!trashMode ? (
        <FloatingActionButton
          icon="plus"
          label="Upload"
          onPress={() => setShowUploadModal(true)}
        />
      ) : null}

      <FileUploadModal
        visible={showUploadModal}
        folderId={currentFolder.id}
        onClose={() => setShowUploadModal(false)}
        onUploaded={() => {
          void invalidateFiles();
        }}
      />

      <PrintModal
        visible={printFileId != null}
        initialFileId={printFileId}
        onClose={() => setPrintFileId(null)}
      />

      <ModalShell
        visible={showExternalFolderModal}
        title="Add external folder"
        subtitle="Register a host folder so it appears in the mobile library."
        onClose={() => setShowExternalFolderModal(false)}
      >
        <TextField label="Display name" value={externalFolderName} onChangeText={setExternalFolderName} placeholder="Shared library" />
        <TextField label="Path" value={externalFolderPath} onChangeText={setExternalFolderPath} placeholder="/Volumes/Prints" />
        <View style={[styles.toggleRow, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
          <View style={styles.toggleText}>
            <Text style={[styles.toggleTitle, { color: colors.text }]}>Read only</Text>
            <Text style={[styles.toggleSubtitle, { color: colors.textSecondary }]}>Keep the external mount protected from write operations.</Text>
          </View>
          <Pressable onPress={() => setExternalFolderReadonly(current => !current)}>
            {externalFolderReadonly ? (
              <CheckCircle size={18} color={colors.success} strokeWidth={2} />
            ) : (
              <Pause size={18} color={colors.textSecondary} strokeWidth={2} />
            )}
          </Pressable>
        </View>
        <View style={styles.modalFooter}>
          <PrimaryButton label="Cancel" variant="secondary" onPress={() => setShowExternalFolderModal(false)} />
          <PrimaryButton
            label={createExternalFolderMutation.isPending ? 'Saving…' : 'Add folder'}
            onPress={() => void createExternalFolderMutation.mutateAsync()}
            disabled={!externalFolderName.trim() || !externalFolderPath.trim() || createExternalFolderMutation.isPending}
          />
        </View>
      </ModalShell>

      <ModalShell
        visible={showPurgeModal}
        title="Purge old files"
        subtitle="Preview old library files before moving them to trash."
        onClose={() => setShowPurgeModal(false)}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {[30, 60, 90, 180, 365].map(days => (
            <Chip key={days} label={`${days} days`} selected={purgeDays === days} onPress={() => setPurgeDays(days)} />
          ))}
        </ScrollView>
        <View style={[styles.toggleRow, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
          <View style={styles.toggleText}>
            <Text style={[styles.toggleTitle, { color: colors.text }]}>Include never printed</Text>
            <Text style={[styles.toggleSubtitle, { color: colors.textSecondary }]}>Also move files that have not been printed yet.</Text>
          </View>
          <Pressable onPress={() => setIncludeNeverPrinted(current => !current)}>
            {includeNeverPrinted ? (
              <CheckCircle size={18} color={colors.success} strokeWidth={2} />
            ) : (
              <Pause size={18} color={colors.textSecondary} strokeWidth={2} />
            )}
          </Pressable>
        </View>
        <View style={[styles.previewCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
          <Text style={[styles.pendingUploadsTitle, { color: colors.text }]}>Preview</Text>
          <Text style={[styles.pendingUploadsText, { color: colors.textSecondary }]}> 
            {libraryPurgePreviewQuery.isLoading
              ? 'Calculating…'
              : `${pickNumber(libraryPurgePreviewQuery.data, ['count'], 0)} file(s) • ${Math.round(pickNumber(libraryPurgePreviewQuery.data, ['total_bytes'], 0) / 1024 / 1024)} MB`}
          </Text>
          {pickArray(libraryPurgePreviewQuery.data as Record<string, unknown>, ['sample_filenames']).slice(0, 5).map(sample => (
            <Text key={String(sample)} style={[styles.previewLine, { color: colors.textSecondary }]}>• {String(sample)}</Text>
          ))}
        </View>
        <View style={styles.modalFooter}>
          <PrimaryButton label="Cancel" variant="secondary" onPress={() => setShowPurgeModal(false)} />
          <PrimaryButton
            label={purgeOldFilesMutation.isPending ? 'Purging…' : 'Purge old files'}
            variant="danger"
            onPress={() => void purgeOldFilesMutation.mutateAsync()}
            disabled={purgeOldFilesMutation.isPending}
          />
        </View>
      </ModalShell>

      <ModalShell
        visible={showTagFilterModal}
        title="Tags"
        subtitle="Filter the file list and manage the library tag catalog."
        onClose={() => setShowTagFilterModal(false)}
      >
        <ScrollView style={styles.modalScroll}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {tagCatalog.map(tag => {
              const tagId = pickNumber(tag, ['id']);
              return (
                <Chip
                  key={tagId}
                  label={`${pickString(tag, ['name'], 'Tag')} (${pickNumber(tag, ['file_count', 'count'], 0)})`}
                  selected={selectedTagIds.includes(tagId)}
                  onPress={() => toggleTagFilter(tagId)}
                />
              );
            })}
          </ScrollView>
          <TextField
            label={editingTagId != null ? 'Rename tag' : 'Create tag'}
            value={tagDraftName}
            onChangeText={setTagDraftName}
            placeholder="favorite"
          />
          <View style={styles.modalFooter}>
            {editingTagId != null ? (
              <PrimaryButton
                label="Cancel edit"
                variant="secondary"
                onPress={() => {
                  setEditingTagId(null);
                  setTagDraftName('');
                }}
              />
            ) : null}
            <PrimaryButton
              label={saveTagMutation.isPending ? 'Saving…' : editingTagId != null ? 'Save tag' : 'Create tag'}
              onPress={() => void saveTagMutation.mutateAsync()}
              disabled={!tagDraftName.trim() || saveTagMutation.isPending}
            />
          </View>
          {tagCatalog.map(tag => (
            <View key={`manage-${pickId(tag)}`} style={[styles.manageRow, { borderColor: colors.borderSubtle }]}> 
              <View style={styles.externalFolderText}>
                <Text style={[styles.externalFolderTitle, { color: colors.text }]}>{pickString(tag, ['name'], 'Tag')}</Text>
                <Text style={[styles.externalFolderMeta, { color: colors.textSecondary }]}> 
                  {pickNumber(tag, ['file_count', 'count'], 0)} linked file(s)
                </Text>
              </View>
              <View style={styles.rowActionWrap}>
                <PrimaryButton
                  label="Edit"
                  variant="secondary"
                  onPress={() => {
                    setEditingTagId(pickNumber(tag, ['id']));
                    setTagDraftName(pickString(tag, ['name']));
                  }}
                />
                <PrimaryButton
                  label="Delete"
                  variant="danger"
                  onPress={() => setPendingTagDelete(tag)}
                />
              </View>
            </View>
          ))}
        </ScrollView>
        <View style={styles.modalFooter}>
          <PrimaryButton label="Close" variant="secondary" onPress={() => setShowTagFilterModal(false)} />
          <PrimaryButton label="Clear filters" variant="secondary" onPress={() => setSelectedTagIds([])} />
        </View>
      </ModalShell>

      <ModalShell
        visible={tagEditorFileIds.length > 0}
        title="Edit file tags"
        subtitle={`Apply tags to ${tagEditorFileIds.length} selected file${tagEditorFileIds.length === 1 ? '' : 's'}.`}
        onClose={() => setTagEditorFileIds([])}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {tagCatalog.map(tag => {
            const tagId = pickNumber(tag, ['id']);
            const selected = tagEditorSelectedIds.includes(tagId);
            return (
              <Chip
                key={`assign-${tagId}`}
                label={pickString(tag, ['name'], 'Tag')}
                selected={selected}
                onPress={() => setTagEditorSelectedIds(current => selected ? current.filter(id => id !== tagId) : [...current, tagId])}
              />
            );
          })}
        </ScrollView>
        <Text style={[styles.pendingUploadsText, { color: colors.textSecondary }]}>Open the tags modal to create or rename catalog tags.</Text>
        <View style={styles.modalFooter}>
          <PrimaryButton label="Cancel" variant="secondary" onPress={() => setTagEditorFileIds([])} />
          <PrimaryButton
            label={assignTagsMutation.isPending ? 'Saving…' : 'Save tags'}
            onPress={() => void assignTagsMutation.mutateAsync()}
            disabled={assignTagsMutation.isPending}
          />
        </View>
      </ModalShell>

      <ConfirmModal
        visible={pendingExternalFolderDelete !== null}
        onClose={() => setPendingExternalFolderDelete(null)}
        onConfirm={() => {
          if (!pendingExternalFolderDelete) return;
          void deleteExternalFolderMutation.mutateAsync(Number(pickId(pendingExternalFolderDelete)));
        }}
        title="Remove external folder?"
        message={pendingExternalFolderDelete ? `Remove ${pickString(pendingExternalFolderDelete, ['name'])} from the mobile file manager?` : ''}
        confirmLabel="Delete"
        loading={deleteExternalFolderMutation.isPending}
      />

      <ConfirmModal
        visible={pendingTagDelete !== null}
        onClose={() => setPendingTagDelete(null)}
        onConfirm={() => {
          if (!pendingTagDelete) return;
          void deleteTagMutation.mutateAsync(pickNumber(pendingTagDelete, ['id']));
        }}
        title="Delete tag?"
        message={pendingTagDelete ? `Delete ${pickString(pendingTagDelete, ['name'])}? Files keep their identity; only the tag link is removed.` : ''}
        confirmLabel="Delete"
        loading={deleteTagMutation.isPending}
      />

      <ConfirmModal
        visible={deleteIds.length > 0}
        onClose={() => setDeleteIds([])}
        onConfirm={() => {
          void deleteMutation.mutateAsync(deleteIds);
        }}
        title={deleteIds.length > 1 ? 'Delete selected files?' : 'Delete this file?'}
        message={
          deleteIds.length > 1
            ? 'The selected library files will be moved to trash.'
            : 'This library file will be moved to trash.'
        }
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 132,
    gap: spacing.lg,
  },
  headerStack: {
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  statsRow: {
    gap: spacing.md,
  },
  filterRow: {
    gap: spacing.sm,
  },
  folderRow: {
    gap: spacing.sm,
  },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pendingUploads: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    gap: spacing.xs,
  },
  pendingUploadsTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  pendingUploadsText: {
    fontSize: fontSize.sm,
  },
  fileCell: {
    marginBottom: spacing.md,
  },
  gridCell: {
    flex: 1,
  },
  listCell: {
    width: '100%',
  },
  gridRow: {
    gap: spacing.md,
  },
  trashItemWrap: {
    marginBottom: spacing.md,
  },
  trashMeta: {
    fontSize: fontSize.sm,
  },
  trashActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  selectionBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
  },
  selectionActions: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  selectionText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    paddingHorizontal: spacing.sm,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingTop: spacing['4xl'],
  },
  modalCard: {
    borderWidth: 1,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
    padding: spacing.lg,
    gap: spacing.md,
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  modalHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
  },
  modalSubtitle: {
    fontSize: fontSize.sm,
  },
  modalScroll: {
    maxHeight: 360,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  moveTarget: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  moveTargetTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  moveTargetSubtitle: {
    fontSize: fontSize.sm,
  },
  previewLine: {
    fontSize: fontSize.sm,
  },
  plateRow: {
    borderBottomWidth: 1,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
  },
  externalFolderRow: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  externalFolderText: {
    gap: spacing.xs,
  },
  externalFolderTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  externalFolderMeta: {
    fontSize: fontSize.sm,
  },
  rowActionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  toggleRow: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  toggleText: {
    flex: 1,
    gap: spacing.xs,
  },
  toggleTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  toggleSubtitle: {
    fontSize: fontSize.sm,
  },
  previewCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  manageRow: {
    borderBottomWidth: 1,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  previewTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  readmeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  readmeText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
});
