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
import { EmptyState, ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { PrintModal } from '@/components/printers/PrintModal';
import { Icon } from '@/components/common/TabBarIcon';
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}> 
        <View style={[styles.modalCard, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderText}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{title}</Text>
              {subtitle ? <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
            </View>
            <Pressable onPress={onClose}>
              <Icon name="x" size={18} color={colors.textSecondary} />
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
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [printFileId, setPrintFileId] = useState<number | null>(null);
  const currentFolder = folderStack[folderStack.length - 1];

  const filesQuery = useQuery({
    queryKey: ['libraryFiles', currentFolder.id ?? 'root'],
    queryFn: () => api.getLibraryFiles(currentFolder.id ?? undefined),
    enabled: !trashMode,
  });
  const rootFilesQuery = useQuery({
    queryKey: ['libraryFiles', 'rootForMove'],
    queryFn: () => api.getLibraryFiles(),
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
  const pendingUploadsQuery = useQuery({
    queryKey: ['pendingUploads'],
    queryFn: () => api.getPendingUploads(),
  });
  const previewPlatesQuery = useQuery({
    queryKey: ['libraryFilePlates', previewItem ? Number(pickId(previewItem)) : null],
    queryFn: () => api.getLibraryFilePlates(Number(pickId(previewItem))),
    enabled: previewItem !== null && !isFolderEntry(previewItem),
  });

  const entries = useMemo(() => {
    const source = trashMode
      ? Array.isArray(trashQuery.data)
        ? trashQuery.data
        : []
      : Array.isArray(filesQuery.data)
      ? filesQuery.data
      : [];
    return source.filter(isRecord);
  }, [filesQuery.data, trashMode, trashQuery.data]);

  const fileTypes = useMemo(() => {
    const values = new Set<string>();
    entries.forEach(item => {
      if (!isFolderEntry(item)) values.add(pickString(item, ['file_type', 'type'], 'file'));
    });
    return Array.from(values).sort();
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const term = search.trim().toLowerCase();
    let result = entries.filter(item => {
      if (typeFilter !== 'all' && !isFolderEntry(item)) {
        if (pickString(item, ['file_type', 'type']) !== typeFilter) return false;
      }
      if (!term) return true;
      const haystack = [
        entryName(item),
        pickString(item, ['filename', 'name']),
        pickString(item, ['created_by_username']),
        pickString(item, ['sliced_for_model']),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });

    const folders = sortEntries(result.filter(isFolderEntry), sortBy);
    const files = sortEntries(result.filter(item => !isFolderEntry(item)), sortBy);
    return [...folders, ...files];
  }, [entries, search, sortBy, typeFilter]);

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
    const source = Array.isArray(rootFilesQuery.data) ? rootFilesQuery.data.filter(isRecord) : [];
    return source.filter(isFolderEntry);
  }, [rootFilesQuery.data]);

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
      tagsQuery.refetch(),
      pendingUploadsQuery.refetch(),
    ]);
  };

  const invalidateFiles = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['libraryFiles'] }),
      queryClient.invalidateQueries({ queryKey: ['libraryTrash'] }),
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
    mutationFn: async (ids: number[]) => {
      for (const id of ids) {
        await api.deleteLibraryItem(id);
      }
    },
    onSuccess: async () => {
      await invalidateFiles();
      setSelectedIds([]);
      showToast('Items deleted.', 'success');
    },
    onError: () => showToast('Unable to delete the selected items.', 'error'),
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

  const toggleSelected = (id: number) => {
    setSelectedIds(current =>
      current.includes(id) ? current.filter(value => value !== id) : [...current, id],
    );
  };

  const openEntry = (item: ApiRecord) => {
    if (trashMode) return;
    if (isFolderEntry(item)) {
      setFolderStack(current => [
        ...current,
        { id: Number(pickId(item)), name: pickString(item, ['name', 'filename'], 'Folder') },
      ]);
      return;
    }
    setPreviewItem(item);
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
                onPress={() => openEntry(item)}
                onToggleSelect={() => toggleSelected(id)}
                onRename={() => {
                  setRenameItem(item);
                  setRenameValue(pickString(item, ['filename', 'name'], ''));
                }}
                onDelete={() => {
                  deleteMutation.mutate([id]);
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
              />
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
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon={trashMode ? '🗑️' : '📁'}
            title={trashMode ? 'Trash is empty' : 'This folder is empty'}
            message={trashMode ? 'Deleted files will appear here until you restore or purge them.' : 'Upload files, create a new folder, or browse into a different folder.'}
          />
        }
      />

      {!trashMode && selectionCount > 0 ? (
        <View style={[styles.selectionBar, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectionActions}>
            <Text style={[styles.selectionText, { color: colors.text }]}>{selectionCount} selected</Text>
            <PrimaryButton label="Move" variant="secondary" onPress={() => setMoveIds(selectedIds)} />
            <PrimaryButton label="Delete" variant="danger" onPress={() => {
              deleteMutation.mutate(selectedIds);
            }} />
            <PrimaryButton label="Clear" variant="secondary" onPress={() => setSelectedIds([])} />
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
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    maxHeight: '85%',
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
});
