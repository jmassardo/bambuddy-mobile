import React, { useMemo, useState } from 'react';
import { CommonActions, useNavigation, useRoute } from '@react-navigation/native';
import type { MainTabNavigationProp } from '@/navigation/types';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Switch,
} from 'react-native';
import { CheckCircle, ChevronDown, ChevronRight, Pause, X } from 'lucide-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { filesApi } from '@/api/files';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n';
import { useLibraryPreference } from '@/hooks/useLibraryPreference';
import { folderDestinations, folderPath, validDays, canGroupVersions } from '@/utils/library';
import { shareBlob } from '@/utils/share';
import { AssetPreviewModal, inferPreviewMode, type AssetPreviewSource } from '@/components/files/AssetPreviewModal';
import { LibraryFileDetails } from '@/components/files/LibraryFileDetails';
import { LibraryPolicy } from '@/components/files/LibraryPolicy';
import { FolderAssociation } from '@/components/files/FolderAssociation';
import { FolderReadme } from '@/components/files/FolderReadme';
import { LibraryFolderTree } from '@/components/files/LibraryFolderTree';
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
import { SliceModal } from '@/components/files/SliceModal';
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
type DateRangeFilter = 'all' | 'today' | 'week' | 'month';
type SizeRangeFilter = 'all' | 'small' | 'medium' | 'large';

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
        return new Date(pickString(b, ['fs_modified_at', 'updated_at', 'created_at', 'modified_at'])).getTime() - new Date(pickString(a, ['fs_modified_at', 'updated_at', 'created_at', 'modified_at'])).getTime();
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
  const { t } = useTranslation();
  const { hasPermission, hasAnyPermission, user, authEnabled } = useAuth();
  const route = useRoute();
  const navigation = useNavigation<MainTabNavigationProp<'Files'>>();
  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Files' });
  }, [navigation]);

  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [folderStack, setFolderStack] = useState<FolderNode[]>([{ id: null, name: 'Library' }]);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useLibraryPreference<FileViewMode>('view', 'list');
  const [sortBy, setSortBy] = useLibraryPreference<FileSort>('sort', 'name');
  const [ascending, setAscending] = useLibraryPreference('ascending', true);
  const [folderSort, setFolderSort] = useLibraryPreference<'name' | 'activity'>('folderSort', 'name');
  const [folderAscending, setFolderAscending] = useLibraryPreference('folderAscending', true);
  const [wrapNames, setWrapNames] = useLibraryPreference('wrapNames', true);
  const [showModified, setShowModified] = useLibraryPreference('showModified', true);
  const [browseTree, setBrowseTree] = useLibraryPreference('browseTree', false);
  const [collapseFolders, setCollapseFolders] = useLibraryPreference('collapseFolders', true);
  const [uploader, setUploader] = useState('');
  const [associationFolder, setAssociationFolder] = useState<ApiRecord | null>(null);
  const [deleteFolder, setDeleteFolder] = useState<ApiRecord | null>(null);
  const [hardDeleteIds, setHardDeleteIds] = useState<number[]>([]);
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false);
  const [viewerSource, setViewerSource] = useState<AssetPreviewSource | null>(null);
  const [combineIds, setCombineIds] = useState<number[]>([]);
  const [copies, setCopies] = useState<Record<number, string>>({});
  const [combinedName, setCombinedName] = useState('');
  const [sliceCombined, setSliceCombined] = useState(false);
  const [sliceAutoArrange, setSliceAutoArrange] = useState(false);
  const [tagAction, setTagAction] = useState<'add' | 'remove' | 'replace'>('add');
  const [tagSearch, setTagSearch] = useState('');
  const [projectLinkTarget, setProjectLinkTarget] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilter>('all');
  const [sizeRangeFilter, setSizeRangeFilter] = useState<SizeRangeFilter>('all');
  const [selectedFileTypes, setSelectedFileTypes] = useState<string[]>([]);
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
  const [externalShowHidden, setExternalShowHidden] = useState(false);
  const [pendingExternalFolderDelete, setPendingExternalFolderDelete] = useState<ApiRecord | null>(null);
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [purgeDays, setPurgeDays] = useState(90);
  const [purgeDaysInput, setPurgeDaysInput] = useState('90');
  const [includeNeverPrinted, setIncludeNeverPrinted] = useState(true);
  const [showTagFilterModal, setShowTagFilterModal] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [tagEditorFileIds, setTagEditorFileIds] = useState<number[]>([]);
  const [tagEditorSelectedIds, setTagEditorSelectedIds] = useState<number[]>([]);
  const [tagDraftName, setTagDraftName] = useState('');
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [pendingTagDelete, setPendingTagDelete] = useState<ApiRecord | null>(null);
  const [readmeExpanded, setReadmeExpanded] = useLibraryPreference('readmeExpanded', true);
  const [showSliceModal, setShowSliceModal] = useState(false);
  const [sliceSourceId, setSliceSourceId] = useState<number | null>(null);
  const [sliceSourceName, setSliceSourceName] = useState('');
  const currentFolder = folderStack[folderStack.length - 1];

  const filesQuery = useQuery({
    queryKey: ['libraryFiles', currentFolder.id ?? 'root', search.trim() !== '', selectedTagIds],
    queryFn: () =>
      currentFolder.id != null
        ? api.getLibraryFiles(currentFolder.id, true, undefined, { recursive: search.trim() !== '', tagIds: selectedTagIds })
        : api.getLibraryFiles(undefined, false, undefined, {tagIds: selectedTagIds}),
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
      const source = trashQuery.data?.items ?? [];
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
  const folderReadmeQuery = useQuery({
    queryKey: ['libraryFolderReadme', currentFolder.id],
    queryFn: () => filesApi.getLibraryFolderReadme(currentFolder.id!),
    enabled: !trashMode && currentFolder.id !== null,
    retry: false,
  });
  const readmeContent = currentFolder.id !== null ? folderReadmeQuery.data?.content : readmeQuery.data;
  const hasReadme = currentFolder.id !== null ? Boolean(folderReadmeQuery.data) : readmeFile !== null;

  const fileTypes = useMemo(() => {
    const values = new Set<string>();
    entries.forEach(item => {
      if (!isFolderEntry(item)) values.add(pickString(item, ['file_type', 'type'], 'file'));
    });
    return Array.from(values).sort();
  }, [entries]);

  const sizeBuckets = useMemo(() => {
    const sizes = entries
      .filter(item => !isFolderEntry(item))
      .map(item => pickNumber(item, ['file_size', 'size', 'size_bytes'], 0))
      .filter(n => n > 0)
      .sort((a, b) => a - b);
    if (sizes.length === 0) return { small: 0, medium: 0 };
    const min = sizes[0];
    const max = sizes[sizes.length - 1];
    const mid = (min + max) / 2;
    return { small: mid, medium: (mid + max) / 2 };
  }, [entries]);

  function matchesDateRange(item: ApiRecord, range: DateRangeFilter) {
    if (range === 'all') return true;
    const stamp = new Date(pickString(item, ['fs_modified_at', 'updated_at', 'created_at', 'modified_at'])).getTime();
    if (!Number.isFinite(stamp)) return true;
    const now = Date.now();
    if (range === 'today') return now - stamp < 24 * 60 * 60 * 1000;
    if (range === 'week') return now - stamp < 7 * 24 * 60 * 60 * 1000;
    if (range === 'month') return now - stamp < 30 * 24 * 60 * 60 * 1000;
    return true;
  }

  const matchesSizeRange = React.useCallback((item: ApiRecord, range: SizeRangeFilter) => {
    if (range === 'all') return true;
    const size = pickNumber(item, ['file_size', 'size', 'size_bytes'], 0);
    if (size === 0) return range === 'small';
    const { small, medium } = sizeBuckets;
    if (range === 'small') return size <= small;
    if (range === 'medium') return size > small && size <= medium;
    if (range === 'large') return size > medium;
    return true;
  }, [sizeBuckets]);

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

  const routeParams = route.params as {folderId?: number; fileId?: number; projectId?: number} | undefined;
  React.useEffect(() => {
    if (routeParams?.folderId == null && routeParams?.fileId == null && routeParams?.projectId == null) return;
    if (routeParams?.folderId != null && !foldersQuery.data) return;
    if (routeParams?.projectId != null && routeParams?.folderId == null && routeParams?.fileId == null) setProjectLinkTarget(routeParams.projectId);
    if (routeParams?.folderId != null && foldersQuery.data) {
      const path = folderPath(foldersQuery.data.filter(isRecord), routeParams.folderId);
      if (path) setFolderStack([{id: null, name: 'Library'}, ...path]);
    }
    if (routeParams?.fileId != null) {
      void filesApi.getLibraryFile(routeParams.fileId).then(file => setPreviewItem(file)).catch((error: Error) => showToast(error.message, 'error'));
    }
    navigation.dispatch({
      ...CommonActions.setParams({folderId: undefined, fileId: undefined, projectId: undefined}),
      source: route.key,
    });
  }, [route.key, routeParams?.folderId, routeParams?.fileId, routeParams?.projectId, foldersQuery.data, showToast, navigation]);


  const filteredEntries = useMemo(() => {
    const term = search.trim().toLowerCase();
    let result = entries.filter(item => {
      if (uploader && (isFolderEntry(item) || !pickString(item, ['created_by_username']).toLowerCase().includes(uploader.toLowerCase()))) return false;
      if (typeFilter !== 'all' && !isFolderEntry(item)) {
        if (pickString(item, ['file_type', 'type']) !== typeFilter) return false;
      }
      if (selectedFileTypes.length > 0 && !isFolderEntry(item)) {
        const fType = pickString(item, ['file_type', 'type'], 'file');
        if (!selectedFileTypes.includes(fType)) return false;
      }
      if (selectedTagIds.length > 0) {
        if (isFolderEntry(item)) return false;
        const itemTagIds = pickArray(item, ['tags'])
          .filter(isRecord)
          .map(tag => pickNumber(tag, ['id']))
          .filter(Boolean);
        if (!selectedTagIds.every(tagId => itemTagIds.includes(tagId))) return false;
      }
      if (!matchesDateRange(item, dateRangeFilter)) return false;
      if (sizeRangeFilter !== 'all') {
        if (sizeBuckets.small === 0 && sizeBuckets.medium === 0 && sizeRangeFilter !== 'small') return false;
        const size = pickNumber(item, ['file_size', 'size', 'size_bytes'], 0);
        if (size === 0 && sizeRangeFilter !== 'small') return false;
        if (sizeRangeFilter === 'small' && size > sizeBuckets.small) return false;
        if (sizeRangeFilter === 'medium' && (size <= sizeBuckets.small || size > sizeBuckets.medium)) return false;
        if (sizeRangeFilter === 'large' && size <= sizeBuckets.medium) return false;
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

    const folders = [...result.filter(isFolderEntry)].sort((a, b) => folderSort === 'name'
      ? entryName(a).localeCompare(entryName(b))
      : new Date(pickString(a, ['latest_activity_at', 'updated_at'])).getTime() - new Date(pickString(b, ['latest_activity_at', 'updated_at'])).getTime());
    if (!folderAscending) folders.reverse();
    const files = sortEntries(result.filter(item => !isFolderEntry(item)), sortBy);
    if (ascending !== (sortBy === 'name' || sortBy === 'type')) files.reverse();
    return [...folders, ...files];
  }, [entries, search, selectedTagIds, selectedFileTypes, dateRangeFilter, sizeRangeFilter, sortBy, typeFilter, sizeBuckets, uploader, folderSort, folderAscending, ascending]);

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

  const moveTargets = useMemo(() => {
    return [{ id: null, name: 'Library root', readonly: false }, ...folderDestinations((foldersQuery.data ?? []).filter(isRecord))];
  }, [foldersQuery.data]);

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
      queryClient.invalidateQueries({ queryKey: ['libraryFileDetails'] }),
      queryClient.invalidateQueries({ queryKey: ['libraryFolderReadme'] }),
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
    mutationFn: ({ id, name }: { id: number; name: string }) => renameItem && isFolderEntry(renameItem)
      ? filesApi.updateLibraryFolder(id, {name}) : api.renameLibraryItem(id, name),
    onSuccess: async (_data, {id, name}) => {
      await invalidateFiles();
      if (renameItem && isFolderEntry(renameItem)) setFolderStack(current => current.map(node => node.id === id ? {...node, name} : node));
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
      setSelectedIds([]);
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
      setHardDeleteIds([]);
      setSelectedIds([]);
      showToast('Item permanently deleted.', 'success');
    },
    onError: () => showToast('Unable to permanently delete the item.', 'error'),
  });

  const emptyTrashMutation = useMutation({
    mutationFn: () => api.emptyLibraryTrash(),
    onSuccess: async () => {
      await invalidateFiles();
      setConfirmEmptyTrash(false);
      setSelectedIds([]);
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
        show_hidden: externalShowHidden,
        parent_id: currentFolder.id,
      }),
    onSuccess: async () => {
      await invalidateFiles();
      setShowExternalFolderModal(false);
      setExternalFolderName('');
      setExternalFolderPath('');
      setExternalFolderReadonly(true);
      setExternalShowHidden(false);
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
    mutationFn: () => api.bulkAssignLibraryTags(tagEditorFileIds, tagEditorSelectedIds, tagAction),
    onSuccess: async () => {
      await invalidateFiles();
      setTagEditorFileIds([]);
      showToast('File tags updated.', 'success');
    },
    onError: (error: Error) => showToast(error.message || 'Unable to update file tags.', 'error'),
  });
  const createSelectionTagMutation = useMutation({
    mutationFn: () => filesApi.createLibraryTag(tagDraftName.trim()),
    onSuccess: async tag => {
      await invalidateFiles();
      const id = pickNumber(tag, ['id']);
      if (id) setTagEditorSelectedIds(current => current.includes(id) ? current : [...current, id]);
      setTagDraftName('');
    },
    onError: (error: Error) => showToast(error.message, 'error'),
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
    if (inferPreviewMode(pickString(item, ['filename', 'name']))) {
      setViewerSource({fileId: id, filename: pickString(item, ['filename', 'name'])});
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
    setTagEditorSelectedIds(ids.length === 1 ? commonTagIds : []);
    setTagAction(ids.length === 1 ? 'replace' : 'add');
    setTagSearch('');
  };

  const folderDeleteMutation = useMutation({
    mutationFn: () => filesApi.deleteLibraryFolder(Number(pickId(deleteFolder!))),
    onSuccess: async () => {
      const id = Number(pickId(deleteFolder!));
      setFolderStack(current => current.some(node => node.id === id) ? current.slice(0, current.findIndex(node => node.id === id)) : current);
      setDeleteFolder(null); await invalidateFiles();
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const thumbnailMutation = useMutation({
    mutationFn: (ids?: number[]) => filesApi.generateLibraryThumbnails(ids ? {file_ids: ids} : {all_missing: true}),
    onSuccess: async result => { await invalidateFiles(); showToast(t('library.thumbnailsResult', {defaultValue: '{{success}} thumbnails generated; {{failed}} failed.', success: result.succeeded, failed: result.failed}), result.failed ? 'error' : 'success'); },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const combineMutation = useMutation({
    mutationFn: () => filesApi.combineLibraryFiles({items: combineIds.map(id => ({file_id: id, copies: Number(copies[id] ?? '1')})), filename: combinedName.trim(), folder_id: currentFolder.id}),
    onSuccess: async result => {
      await invalidateFiles(); setCombineIds([]); setSelectedIds([]);
      if (sliceCombined) { setSliceSourceId(result.id); setSliceSourceName(result.filename); setSliceAutoArrange(true); setShowSliceModal(true); }
      showToast(t('library.combined', {defaultValue: 'Combined 3MF created.'}), 'success');
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const groupMutation = useMutation({
    mutationFn: () => filesApi.groupLibraryVersions(selectedIds),
    onSuccess: async () => { await invalidateFiles(); setSelectedIds([]); showToast(t('library.versionsGrouped', { defaultValue: 'Sliced files grouped as versions.' }), 'success'); },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const linkProjectMutation = useMutation({
    mutationFn: async ({fileIds, folderId}: {fileIds?: number[]; folderId?: number}) => {
      if (projectLinkTarget === null) return;
      if (folderId !== undefined) await filesApi.updateLibraryFolder(folderId, {project_id: projectLinkTarget});
      for (const id of fileIds ?? []) await filesApi.updateLibraryFile(id, {project_id: projectLinkTarget});
    },
    onSuccess: async () => {
      await Promise.all([invalidateFiles(), ...['projects', 'project', 'projectDetail', 'projectFolders', 'projectFiles', 'projectLibraryFiles', 'projectFileProgress', 'projectActionArchives'].map(key => queryClient.invalidateQueries({queryKey: [key]}))]);
      setSelectedIds([]);
      showToast(t('library.linkedProject', {defaultValue: 'Library items linked to project.'}), 'success');
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  const downloadFile = async (item: ApiRecord) => {
    showToast(t('library.downloading', { defaultValue: 'Downloading original file…' }), 'info');
    try { await shareBlob(await filesApi.downloadFileBlob(Number(pickId(item))), pickString(item, ['filename', 'name'])); }
    catch (error) { showToast(error instanceof Error ? error.message : t('library.downloadFailed', { defaultValue: 'Download failed.' }), 'error'); }
  };
  const canEdit = (item: ApiRecord) => !authEnabled || hasPermission('library:update_all') || (hasPermission('library:update_own') && user?.id === pickNumber(item, ['created_by_id']));
  const canDelete = (item: ApiRecord) => isFolderEntry(item)
    ? hasPermission('library:delete_all') || (hasPermission('library:delete_own') && !item.is_external && !item.project_id && !item.archive_id && pickNumber(item, ['file_count']) === 0 && pickArray(item, ['children']).length === 0)
    : hasPermission('library:delete_all') || (hasPermission('library:delete_own') && user?.id === pickNumber(item, ['created_by_id']));
  const selectedFiles = entries.filter(item => !isFolderEntry(item) && selectedIds.includes(Number(pickId(item))));

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
        keyExtractor={item => `${trashMode ? 'trash' : isFolderEntry(item) ? 'folder' : 'file'}-${pickId(item)}`}
        numColumns={!trashMode && viewMode === 'grid' ? 2 : 1}
        renderItem={({ item }) => {
          if (trashMode) {
            const id = Number(pickId(item));
            return (
              <View style={styles.trashItemWrap}>
                <SectionCard title={pickString(item, ['filename', 'name'], 'Deleted item')} subtitle={`Deleted ${formatDateTime(pickString(item, ['deleted_at', 'created_at']))}`}>
                  <Chip label={t('library.selectItem', {defaultValue: 'Select {{name}}', name: entryName(item)})} selected={selectedIds.includes(id)} onPress={() => toggleSelected(id)} />
                  <Text style={[styles.trashMeta, { color: colors.textSecondary }]}>Auto purge {formatDateTime(pickString(item, ['auto_purge_at']))}</Text>
                  <Text style={[styles.trashMeta, { color: colors.textSecondary }]}>Folder {pickString(item, ['folder_name'], 'Library')}</Text>
                  <Text style={[styles.trashMeta, { color: colors.textSecondary }]}>{formatFileSize(pickNumber(item, ['file_size']))}</Text>
                  <View style={styles.trashActions}>
                    <PrimaryButton label="Restore" onPress={() => {
                      restoreMutation.mutate([id]);
                    }} />
                    <PrimaryButton label="Delete" variant="danger" onPress={() => {
                      setHardDeleteIds([id]);
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
                wrapName={wrapNames}
                showModified={showModified}
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
                onRename={(isFolderEntry(item) ? hasPermission('library:update_all') : canEdit(item)) ? () => {
                  setRenameItem(item);
                  setRenameValue(pickString(item, ['filename', 'name'], ''));
                } : undefined}
                onDelete={canDelete(item) ? () => {
                  if (isFolderEntry(item)) setDeleteFolder(item); else setDeleteIds([id]);
                } : undefined}
                onMove={canEdit(item) ? () => setMoveIds([id]) : undefined}
                onLink={hasPermission('library:update_all') ? () => setAssociationFolder(item) : undefined}
                onDownload={() => void downloadFile(item)}
                onPreview={() => setViewerSource({fileId: id, filename: pickString(item, ['filename', 'name'])})}
                onDetails={() => setPreviewItem(item)}
                on3dPreview={() => setViewerSource({fileId: id, filename: pickString(item, ['filename', 'name']), mode: 'model'})}
                onSlice={() => {
                  setSliceSourceId(Number(pickId(item)));
                  setSliceSourceName(pickString(item, ['print_name', 'filename', 'name'], ''));
                  setSliceAutoArrange(false);
                  setShowSliceModal(true);
                }}
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
              <StatCard label={trashMode ? 'Trash items' : 'Files'} value={String(trashMode ? trashQuery.data?.total ?? 0 : fileStats.files)} helper={trashMode ? `${trashQuery.data?.retention_days ?? 0} days retention` : 'Current folder'} />
              <StatCard label="Folders" value={String(fileStats.folders)} helper="Current folder" />
              <StatCard label="Size" value={formatFileSize(fileStats.totalSize)} helper="Visible items" />
              <StatCard label="Tags" value={String(Array.isArray(tagsQuery.data) ? tagsQuery.data.length : 0)} helper="Library catalog" />
              <StatCard label="Pending uploads" value={String(pendingUploads.length)} helper="Server queue" />
            </ScrollView>

            <SectionCard title={trashMode ? 'Library trash' : 'File manager'} subtitle={trashMode ? 'Recover or permanently delete files from trash.' : 'Folder navigation, upload, file actions, and web-style metadata in one mobile view.'}>
              {trashMode ? <Text style={[styles.trashMeta, {color: colors.textSecondary}]}>{t('library.retentionSummary', {defaultValue: '{{days}} days retention', days: trashQuery.data?.retention_days ?? 0})}</Text> : null}
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
              {!trashMode ? <>
                {projectLinkTarget !== null ? <SectionCard title={t('library.linkProjectTitle', {defaultValue: 'Link to project #{{id}}', id: projectLinkTarget})} subtitle={t('library.linkProjectInstructions', {defaultValue: 'Browse to a folder or select files, then link them. Existing project links on those items will be replaced.'})}>
                  {currentFolder.id !== null && hasPermission('library:update_all') ? <PrimaryButton label={t('library.linkCurrentProject', {defaultValue: 'Link current folder to this project'})} onPress={() => linkProjectMutation.mutate({folderId: currentFolder.id!})} disabled={linkProjectMutation.isPending} /> : null}
                  <PrimaryButton label={t('common.done', {defaultValue: 'Done'})} variant="secondary" onPress={() => setProjectLinkTarget(null)} />
                </SectionCard> : null}
                <TextField label={t('library.uploaderFilter', {defaultValue: 'Uploader (independent filter)'})} value={uploader} onChangeText={setUploader} placeholder={t('library.anyUploader', {defaultValue: 'Any uploader'})} />
                <ScrollView horizontal contentContainerStyle={styles.filterRow}>
                  <Chip label={t('library.anyUploader', {defaultValue: 'Any uploader'})} selected={!uploader} onPress={() => setUploader('')} />
                  {Array.from(new Set(entries.filter(item => !isFolderEntry(item)).map(item => pickString(item, ['created_by_username'])).filter(Boolean))).map(name => <Chip key={name} label={name} selected={uploader === name} onPress={() => setUploader(name)} />)}
                </ScrollView>
                <ScrollView horizontal contentContainerStyle={styles.filterRow}>
                  <Chip label={t('library.ascending', {defaultValue: 'Ascending'})} selected={ascending} onPress={() => setAscending(true)} />
                  <Chip label={t('library.descending', {defaultValue: 'Descending'})} selected={!ascending} onPress={() => setAscending(false)} />
                  <Chip label={t('library.folderNameSort', {defaultValue: 'Folders: name'})} selected={folderSort === 'name'} onPress={() => setFolderSort('name')} />
                  <Chip label={t('library.folderActivitySort', {defaultValue: 'Folders: recent activity'})} selected={folderSort === 'activity'} onPress={() => setFolderSort('activity')} />
                  <Chip label={folderAscending ? t('library.foldersAsc', {defaultValue: 'Folders ↑'}) : t('library.foldersDesc', {defaultValue: 'Folders ↓'})} selected onPress={() => setFolderAscending(value => !value)} />
                  <Chip label={t('library.multilevel', {defaultValue: 'Multilevel folder browser'})} selected={browseTree} onPress={() => setBrowseTree(value => !value)} />
                  <Chip label={t('library.collapseFolders', {defaultValue: 'Folders collapsed by default'})} selected={collapseFolders} onPress={() => setCollapseFolders(value => !value)} />
                  <Chip label={t('library.wrapNames', {defaultValue: 'Wrap names'})} selected={wrapNames} onPress={() => setWrapNames(value => !value)} />
                  <Chip label={t('library.showModified', {defaultValue: 'Show modified date'})} selected={showModified} onPress={() => setShowModified(value => !value)} />
                </ScrollView>
                {browseTree ? <LibraryFolderTree tree={(foldersQuery.data ?? []).filter(isRecord)} sort={folderSort} ascending={folderAscending} collapsed={collapseFolders} wrap={wrapNames} onChoose={id => {
                  const path = id === null ? [] : folderPath((foldersQuery.data ?? []).filter(isRecord), id);
                  if (path) { setFolderStack([{id: null, name: 'Library'}, ...path]); setSelectedIds([]); }
                }} /> : null}
                {currentFolder.id !== null ? <View style={styles.headerActions}>
                  {hasPermission('library:update_all') ? <>
                    <PrimaryButton label={t('library.renameFolder', {defaultValue: 'Rename current folder'})} variant="secondary" onPress={() => {setRenameItem({id: currentFolder.id!, name: currentFolder.name, is_folder: true}); setRenameValue(currentFolder.name);}} />
                    <PrimaryButton label={t('library.linkFolder', {defaultValue: 'Link current folder'})} variant="secondary" onPress={() => {
                      const find = (nodes: ApiRecord[]): ApiRecord | undefined => {for (const node of nodes) {if (node.id === currentFolder.id) return node; const found = find(pickArray(node, ['children']).filter(isRecord)); if (found) return found;} return undefined;};
                      setAssociationFolder(find((foldersQuery.data ?? []).filter(isRecord)) ?? null);
                    }} />
                  </> : null}
                </View> : null}
              </> : null}
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
                  <Chip label="All types" selected={typeFilter === 'all' && selectedFileTypes.length === 0} onPress={() => { setTypeFilter('all'); setSelectedFileTypes([]); }} />
                  {fileTypes.map(type => (
                    <Chip
                      key={type}
                      label={type.toUpperCase()}
                      selected={selectedFileTypes.length > 0 ? selectedFileTypes.includes(type) : typeFilter === type}
                      onPress={() => {
                        if (selectedFileTypes.length === 0) {
                          setTypeFilter(type);
                        } else if (selectedFileTypes.includes(type)) {
                          setSelectedFileTypes(current => current.filter(value => value !== type));
                        } else {
                          setSelectedFileTypes(current => [...current, type]);
                        }
                      }}
                    />
                  ))}
                </ScrollView>
              ) : null}
              {!trashMode ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                  {(['today', 'week', 'month'] as const).map(range => {
                    const now = Date.now();
                    const count = entries.filter(item => {
                      if (isFolderEntry(item)) return false;
                      const stamp = new Date(pickString(item, ['fs_modified_at', 'updated_at', 'created_at', 'modified_at'])).getTime();
                      if (range === 'today') return now - stamp < 24 * 60 * 60 * 1000;
                      if (range === 'week') return now - stamp < 7 * 24 * 60 * 60 * 1000;
                      if (range === 'month') return now - stamp < 30 * 24 * 60 * 60 * 1000;
                      return false;
                    }).length;
                    return (
                      <Chip
                        key={range}
                        label={`${range[0].toUpperCase()}${range.slice(1)}${count ? ` (${count})` : ''}`}
                        selected={dateRangeFilter === range}
                        onPress={() => setDateRangeFilter(range)}
                      />
                    );
                  })}
                  <Chip label="All dates" selected={dateRangeFilter === 'all'} onPress={() => setDateRangeFilter('all')} />
                </ScrollView>
              ) : null}
              {!trashMode ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                  <Chip label="All sizes" selected={sizeRangeFilter === 'all'} onPress={() => setSizeRangeFilter('all')} />
                  {(['small', 'medium', 'large'] as const).map(size => {
                    const count = entries.filter(item => matchesSizeRange(item, size)).length;
                    return (
                      <Chip
                        key={size}
                        label={`${size[0].toUpperCase()}${size.slice(1)}${count ? ` (${count})` : ''}`}
                        selected={sizeRangeFilter === size}
                        onPress={() => setSizeRangeFilter(size)}
                      />
                    );
                  })}
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
                {((typeFilter !== 'all' || selectedFileTypes.length > 0 || dateRangeFilter !== 'all' || sizeRangeFilter !== 'all') && !trashMode) ? (
                  <PrimaryButton
                    label="Clear filters"
                    variant="secondary"
                    onPress={() => {
                      setTypeFilter('all');
                      setSelectedFileTypes([]);
                      setDateRangeFilter('all');
                      setSizeRangeFilter('all');
                    }}
                  />
                ) : null}
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
                  disabled={trashMode || !hasPermission('library:upload') || moveTargets.some(target => target.id === currentFolder.id && target.readonly)}
                />
                <PrimaryButton
                  label="New folder"
                  variant="secondary"
                  onPress={() => setShowNewFolder(true)}
                  disabled={trashMode || !hasPermission('library:upload')}
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
                  disabled={trashMode || !hasPermission('library:purge')}
                />
                <PrimaryButton
                  label="External folders"
                  variant="secondary"
                  onPress={() => setShowExternalFolderModal(true)}
                  disabled={trashMode || !hasPermission('settings:update')}
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
                  <>
                  <PrimaryButton label={t('library.selectAllTrash', {defaultValue: 'Select all trash'})} variant="secondary" onPress={() => setSelectedIds(entries.map(item => Number(pickId(item))))} />
                  <PrimaryButton label={t('library.restoreSelected', {defaultValue: 'Restore selected ({{count}})', count: selectedIds.length})} disabled={!selectedIds.length || restoreMutation.isPending} onPress={() => restoreMutation.mutate(selectedIds)} />
                  <PrimaryButton label={t('library.deleteSelected', {defaultValue: 'Permanently delete selected ({{count}})', count: selectedIds.length})} variant="danger" disabled={!selectedIds.length} onPress={() => setHardDeleteIds(selectedIds)} />
                  <PrimaryButton label={t('library.clearSelection', {defaultValue: 'Clear selection'})} variant="secondary" onPress={() => setSelectedIds([])} />
                  <PrimaryButton
                    label="Empty trash"
                    variant="danger"
                    onPress={() => {
                      setConfirmEmptyTrash(true);
                    }}
                    disabled={emptyTrashMutation.isPending || entries.length === 0}
                  />
                  </>
                ) : null}
                {!trashMode && hasAnyPermission('library:update_all', 'library:update_own') ? <PrimaryButton label={t('library.generateMissing', {defaultValue: 'Generate all missing thumbnails'})} variant="secondary" disabled={thumbnailMutation.isPending} onPress={() => thumbnailMutation.mutate(undefined)} /> : null}
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
            {trashMode ? <LibraryPolicy /> : null}

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
                          disabled={scanExternalFolderMutation.isPending || !hasPermission('settings:update')}
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
          !trashMode && hasReadme ? (
            <SectionCard
              title="README"
              subtitle={folderReadmeQuery.data?.filename ?? (readmeFile ? pickString(readmeFile, ['filename', 'name'], 'README.md') : 'README.md')}
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
                  <>
                    {folderReadmeQuery.data?.truncated ? <Text style={[styles.readmeText, {color: colors.warning}]}>{t('library.readmeTruncated', {defaultValue: 'This README was truncated by the server. Download the original for the complete document.'})}</Text> : null}
                    <FolderReadme markdown={(readmeContent ?? '').trim() || t('library.emptyReadme', {defaultValue: 'This README is empty.'})} />
                  </>
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
            {projectLinkTarget !== null ? <PrimaryButton label={t('library.linkSelectedProject', {defaultValue: 'Link selected files to project'})} onPress={() => linkProjectMutation.mutate({fileIds: selectedIds})} disabled={linkProjectMutation.isPending} /> : null}
            {hasPermission('library:upload') && selectedFiles.length && selectedFiles.every(file => /\.stl$/i.test(pickString(file, ['filename']))) ? <PrimaryButton label={t('library.combine', {defaultValue: 'Combine STL → 3MF'})} onPress={() => {setCombineIds(selectedIds); setCopies(Object.fromEntries(selectedIds.map(id => [id, '1']))); setCombinedName('combined.3mf'); setSliceCombined(false);}} /> : null}
            {canGroupVersions(selectedFiles) && selectedFiles.every(canEdit) ? <PrimaryButton label={t('library.groupVersions', {defaultValue: 'Group as versions'})} onPress={() => groupMutation.mutate()} disabled={groupMutation.isPending} /> : null}
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
              disabled={target.readonly || moveMutation.isPending}
              onPress={() => {
                moveMutation.mutate({ ids: moveIds, targetId: target.id });
              }}
              style={[styles.moveTarget, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
            >
              <Text style={[styles.moveTargetTitle, { color: target.readonly ? colors.textTertiary : colors.text }]}>{target.name}{target.readonly ? t('library.readonlySuffix', {defaultValue: ' (read only)'}) : ''}</Text>
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
              <Text style={[styles.previewLine, { color: colors.text }]}>Updated: {formatDateTime(pickString(previewItem, ['fs_modified_at', 'updated_at', 'created_at', 'modified_at']))}</Text>
              <Text style={[styles.previewLine, { color: colors.text }]}>Uploader: {pickString(previewItem, ['created_by_username'], 'Unknown')}</Text>
              <Text style={[styles.previewLine, { color: colors.text }]}>Prints: {pickNumber(previewItem, ['print_count'], 0)}</Text>
              {pickString(previewItem, ['sliced_for_model']) ? (
                <Text style={[styles.previewLine, { color: colors.text }]}>Sliced for: {pickString(previewItem, ['sliced_for_model'])}</Text>
              ) : null}
            </SectionCard>
            <LibraryFileDetails fileId={Number(pickId(previewItem))} />
            <View style={styles.headerActions}>
              {projectLinkTarget !== null && canEdit(previewItem) ? <PrimaryButton label={t('library.linkFileProject', {defaultValue: 'Link this file to project'})} onPress={() => linkProjectMutation.mutate({fileIds: [Number(pickId(previewItem))]})} disabled={linkProjectMutation.isPending} /> : null}
              {inferPreviewMode(pickString(previewItem, ['filename', 'name'])) ? <PrimaryButton label={t('library.openPreview', {defaultValue: 'Open content preview'})} onPress={() => setViewerSource({fileId: Number(pickId(previewItem)), filename: pickString(previewItem, ['filename', 'name'])})} /> : null}
              {/\.3mf$/i.test(pickString(previewItem, ['filename'])) ? <PrimaryButton label={t('library.openToolpath', {defaultValue: 'Inspect toolpaths'})} variant="secondary" onPress={() => setViewerSource({fileId: Number(pickId(previewItem)), filename: pickString(previewItem, ['filename']), mode: 'gcode'})} /> : null}
              {canEdit(previewItem) && /\.(stl|pdf)$/i.test(pickString(previewItem, ['filename'])) ? <PrimaryButton label={t('library.generateThumbnail', {defaultValue: 'Generate / repair thumbnail'})} variant="secondary" disabled={thumbnailMutation.isPending} onPress={() => thumbnailMutation.mutate([Number(pickId(previewItem))])} /> : null}
              <PrimaryButton label={t('library.downloadOriginal', {defaultValue: 'Download / share original'})} variant="secondary" onPress={() => void downloadFile(previewItem)} />
            </View>

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
        {previewItem ? <AssetPreviewModal source={viewerSource} onClose={() => setViewerSource(null)} /> : null}
      </ModalShell>

      {!trashMode && hasPermission('library:upload') && !moveTargets.some(target => target.id === currentFolder.id && target.readonly) ? (
        <FloatingActionButton
          icon="plus"
          label="Upload"
          onPress={() => setShowUploadModal(true)}
        />
      ) : null}

      {!previewItem ? <AssetPreviewModal source={viewerSource} onClose={() => setViewerSource(null)} /> : null}
      <ModalShell visible={associationFolder !== null} title={t('library.folderAssociation', {defaultValue: 'Folder association'})} onClose={() => setAssociationFolder(null)}>
        {associationFolder ? <FolderAssociation folder={associationFolder} onSaved={() => {setAssociationFolder(null); void invalidateFiles();}} /> : null}
      </ModalShell>
      <ModalShell visible={combineIds.length > 0} title={t('library.combineModels', {defaultValue: 'Combine STL models'})} onClose={() => setCombineIds([])}>
        <ScrollView style={styles.modalScroll}>
          <TextField label={t('library.outputFilename', {defaultValue: 'Output filename'})} value={combinedName} onChangeText={setCombinedName} />
          {combineIds.map(id => <TextField key={id} label={t('library.copiesOf', {defaultValue: 'Copies: {{name}} (1–100)', name: entryName(entries.find(item => Number(pickId(item)) === id) ?? {})})} value={copies[id] ?? '1'} keyboardType="number-pad" onChangeText={value => setCopies(current => ({...current, [id]: value}))} />)}
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleTitle, {color: colors.text}]}>{t('library.sliceNext', {defaultValue: 'Slice next with auto-arrange'})}</Text>
            <Switch value={sliceCombined} onValueChange={setSliceCombined} />
          </View>
        </ScrollView>
        <PrimaryButton label={t('library.combine', {defaultValue: 'Combine STL → 3MF'})} disabled={combineMutation.isPending || !combinedName.trim() || combineIds.some(id => validDays(copies[id] ?? '1', 1, 100) === null)} onPress={() => combineMutation.mutate()} />
      </ModalShell>
      <ConfirmModal visible={deleteFolder !== null} onClose={() => setDeleteFolder(null)} onConfirm={() => folderDeleteMutation.mutate()}
        title={t('library.deleteFolder', {defaultValue: 'Permanently delete folder and descendants?'})}
        message={t('library.deleteFolderImpact', {defaultValue: 'Permanently delete “{{name}}” and all nested folders? At least {{count}} active file(s), plus any trashed descendants, will be deleted and cannot be restored. External folders are unlinked; their disk contents are not deleted.', name: deleteFolder ? entryName(deleteFolder) : '', count: deleteFolder ? (() => { const count = (node: ApiRecord): number => pickNumber(node, ['file_count']) + pickArray(node, ['children']).filter(isRecord).reduce((sum, child) => sum + count(child), 0); return count(deleteFolder); })() : 0})}
        confirmLabel={t('common.delete')} loading={folderDeleteMutation.isPending} />
      <ConfirmModal visible={hardDeleteIds.length > 0} onClose={() => setHardDeleteIds([])} onConfirm={() => permanentDeleteMutation.mutate(hardDeleteIds)}
        title={t('library.permanentDelete', {defaultValue: 'Permanently delete {{count}} file(s)?', count: hardDeleteIds.length})}
        message={t('library.permanentDeleteNames', {defaultValue: 'This cannot be undone: {{names}}', names: entries.filter(item => hardDeleteIds.includes(Number(pickId(item)))).map(entryName).join(', ')})}
        confirmLabel={t('common.delete')} loading={permanentDeleteMutation.isPending} />
      <ConfirmModal visible={confirmEmptyTrash} onClose={() => setConfirmEmptyTrash(false)} onConfirm={() => emptyTrashMutation.mutate()}
        title={t('library.emptyTrashConfirm', {defaultValue: 'Permanently delete all {{count}} trash items?', count: trashQuery.data?.total ?? 0})}
        message={t('library.emptyTrashWarning', {defaultValue: 'This deletes the original assets and cannot be undone.'})}
        confirmLabel={t('common.delete')} loading={emptyTrashMutation.isPending} />

      <FileUploadModal
        visible={showUploadModal}
        folderId={currentFolder.id}
        onClose={() => setShowUploadModal(false)}
        onUploaded={() => {
          void invalidateFiles();
        }}
      />

      <PrintModal
        {...{initialMode: 'asap'}}
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
        <View style={styles.toggleRow}>
          <Text style={[styles.toggleTitle, {color: colors.text}]}>{t('library.showHidden', {defaultValue: 'Include hidden files'})}</Text>
          <Switch accessibilityLabel={t('library.showHidden', {defaultValue: 'Include hidden files'})} value={externalShowHidden} onValueChange={setExternalShowHidden} />
        </View>
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
            <Chip key={days} label={`${days} days`} selected={purgeDays === days} onPress={() => {setPurgeDays(days); setPurgeDaysInput(String(days));}} />
          ))}
        </ScrollView>
        <TextField label={t('library.customPurgeAge', {defaultValue: 'Older than days (1–3650)'})} value={purgeDaysInput} keyboardType="number-pad" onChangeText={value => {setPurgeDaysInput(value); const days = validDays(value); if (days !== null) setPurgeDays(days);}} />
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
            disabled={purgeOldFilesMutation.isPending || validDays(purgeDaysInput) === null || libraryPurgePreviewQuery.isError || libraryPurgePreviewQuery.isFetching}
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
        <SearchBar value={tagSearch} onChangeText={setTagSearch} placeholder={t('library.searchTags', {defaultValue: 'Search or create tags'})} />
        <View style={styles.headerActions}>
          {(['add', 'remove', 'replace'] as const).map(action => <Chip key={action} label={t(`library.tagAction.${action}`, {defaultValue: {add: 'Add selected tags', remove: 'Remove selected tags', replace: 'Replace all tags'}[action]})} selected={tagAction === action} onPress={() => setTagAction(action)} />)}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {tagCatalog.filter(tag => pickString(tag, ['name']).toLowerCase().includes(tagSearch.toLowerCase())).map(tag => {
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
        <TextField label={t('library.createTag', {defaultValue: 'Create tag without leaving selection'})} value={tagDraftName} onChangeText={setTagDraftName} />
        <PrimaryButton label={t('library.createTag', {defaultValue: 'Create tag'})} disabled={!tagDraftName.trim() || createSelectionTagMutation.isPending} onPress={() => createSelectionTagMutation.mutate()} />
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
        message={pendingExternalFolderDelete ? t('library.removeExternalImpact', {defaultValue: 'Unlink “{{name}}” and all nested folders and file entries? Library metadata and result photos will be removed. Original files on the external disk will not be deleted.', name: pickString(pendingExternalFolderDelete, ['name'])}) : ''}
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

      <SliceModal
        {...{defaultAutoArrange: sliceAutoArrange}}
        visible={showSliceModal}
        onClose={() => {
          setShowSliceModal(false);
          setSliceSourceId(null);
          setSliceSourceName('');
        }}
        sourceType="file"
        sourceId={sliceSourceId ?? 0}
        sourceName={sliceSourceName}
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
