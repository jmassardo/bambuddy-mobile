import type {
  ApiEntity,
  LibraryFile,
  LibraryFileListItem,
  LibraryFolderTree,
  LibraryStats,
  LibraryTrashItem,
  LibraryTrashResponse,
  LibraryTrashSettings,
  LibraryFolderReadme,
  LibraryThumbnailBatch,
  LibraryFileUploadResult,
} from '@/types/api';
import {
  ApiError,
  buildMediaUrl,
  request,
  requestBlob,
  requestText,
  uploadFile,
  uploadFileWithProgress,
  type UploadableFile,
} from './http';

function flattenFolders(
  nodes: Record<string, unknown>[],
): Record<string, unknown>[] {
  return nodes.flatMap(node => {
    const children = Array.isArray(node.children)
      ? (node.children as Record<string, unknown>[])
      : [];
    return [node, ...flattenFolders(children)];
  });
}

export const filesApi = {
  getLibraryFolders: async () =>
    request<Array<ApiEntity<LibraryFolderTree>>>('/library/folders'),

  getLibraryFoldersByProject: async (projectId: number) =>
    request<Array<ApiEntity<LibraryFolderTree>>>(
      `/library/folders/by-project/${projectId}`,
    ),

  getLibraryFiles: async (
    folderId?: number | null,
    includeRoot = true,
    projectId?: number,
    filters?: { recursive?: boolean; tagIds?: number[] },
  ) => {
    const params = new URLSearchParams();
    if (folderId !== undefined && folderId !== null) {
      params.set('folder_id', String(folderId));
    }
    if (!includeRoot) {
      params.set('include_root', 'false');
    }
    if (projectId !== undefined) {
      params.set('project_id', String(projectId));
    }
    if (filters?.recursive) params.set('recursive', 'true');
    filters?.tagIds?.forEach(id => params.append('tag_ids', String(id)));
    const query = params.toString();
    return request<Array<ApiEntity<LibraryFileListItem>>>(
      `/library/files${query ? `?${query}` : ''}`,
    );
  },

  getLibraryFile: async (id: number) =>
    request<ApiEntity<LibraryFile>>(`/library/files/${id}`),

  getLibraryFolderReadme: async (id: number) => {
    try {
      return await request<LibraryFolderReadme>(`/library/folders/${id}/readme`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },

  createFolder: async (data: { name: string; parent_id?: number }) =>
    request<Record<string, unknown>>('/library/folders', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  renameLibraryItem: async (id: number, name: string) =>
    request<Record<string, unknown>>(`/library/files/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ filename: name }),
    }),

  updateLibraryFolder: (id: number, data: {
    name?: string; project_id?: number; archive_id?: number;
  }) => request<Record<string, unknown>>(`/library/folders/${id}`, {
    method: 'PUT', body: JSON.stringify(data),
  }),

  deleteLibraryFolder: (id: number) =>
    request<void>(`/library/folders/${id}`, { method: 'DELETE' }),

  updateLibraryFile: (id: number, data: { notes?: string; external_url?: string; project_id?: number }) =>
    request<ApiEntity<LibraryFile>>(`/library/files/${id}`, {
      method: 'PUT', body: JSON.stringify(data),
    }),

  generateLibraryThumbnails: (data: { file_ids?: number[]; folder_id?: number; all_missing?: boolean }) =>
    request<LibraryThumbnailBatch>(
      '/library/generate-stl-thumbnails', { method: 'POST', body: JSON.stringify(data) },
    ),

  combineLibraryFiles: (data: {
    items: Array<{file_id: number; copies: number}>;
    filename: string; folder_id: number | null;
  }) => request<LibraryFileUploadResult>('/library/files/combine', {
    method: 'POST', body: JSON.stringify(data),
  }),

  groupLibraryVersions: (ids: number[], name?: string) =>
    request<Record<string, unknown>>('/library/variant-groups', {
      method: 'POST',
      body: JSON.stringify({ name, members: ids.map(library_file_id => ({ library_file_id })) }),
    }),

  uploadLibraryPhoto: (id: number, file: UploadableFile) =>
    uploadFile(`/library/files/${id}/photos`, file),

  deleteLibraryPhoto: (id: number, filename: string) =>
    request<void>(`/library/files/${id}/photos/${encodeURIComponent(filename)}`, { method: 'DELETE' }),

  getLibraryPhoto: (id: number, filename: string) =>
    requestBlob(`/library/files/${id}/photos/${encodeURIComponent(filename)}`),

  moveLibraryItem: async (id: number, folderId: number | null) =>
    request<Record<string, unknown>>('/library/files/move', {
      method: 'POST',
      body: JSON.stringify({ file_ids: [id], folder_id: folderId }),
    }),

  uploadLibraryFile: async (
    file: UploadableFile,
    folderId?: number | null,
    onProgress?: (progress: number) => void,
    options?: { preserveStructure?: boolean; createFolderFromZip?: boolean; generateThumbnails?: boolean },
  ) => {
    const params = new URLSearchParams();
    if (folderId != null) {
      params.set('folder_id', String(folderId));
    }
    params.set('generate_stl_thumbnails', String(options?.generateThumbnails ?? true));
    const isZip = /\.zip$/i.test(file.name);
    if (isZip) {
      params.set('preserve_structure', String(options?.preserveStructure ?? true));
      params.set('create_folder_from_zip', String(options?.createFolderFromZip ?? false));
    }
    const primaryEndpoint = `/library/files${isZip ? '/extract-zip' : ''}?${params}`;
    if (onProgress) {
      return uploadFileWithProgress<Record<string, unknown>>(
        primaryEndpoint, file, onProgress,
      );
    }
    return uploadFile<Record<string, unknown>>(primaryEndpoint, file);
  },

  getLibraryFilePlates: async (id: number) =>
    request<Record<string, unknown>>(`/library/files/${id}/plates`),

  getLibraryFileFilamentRequirements: async (id: number, plateId?: number) => {
    const params = new URLSearchParams();
    if (plateId !== undefined) {
      params.set('plate_id', String(plateId));
    }
    const query = params.toString();

    return request<Record<string, unknown>>(`/library/files/${id}/filament-requirements${query ? `?${query}` : ''}`);
  },

  getLibraryFilePlateThumbnail: (id: number, plateIndex: number): string =>
    buildMediaUrl(`/library/files/${id}/plate-thumbnail/${plateIndex}`),

  getLibraryFileThumbnailUrl: (id: number): string =>
    buildMediaUrl(`/library/files/${id}/thumbnail`),

  getLibraryFileDownloadUrl: (id: number): string =>
    buildMediaUrl(`/library/files/${id}/download`),

  getLibraryFileText: async (id: number) =>
    requestText(`/library/files/${id}/download`),

  getLibraryTags: async () =>
    request<{ name: string; count: number }[]>('/library/tags'),

  createLibraryTag: async (name: string) =>
    request<Record<string, unknown>>('/library/tags', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  updateLibraryTag: async (id: number, name: string) =>
    request<Record<string, unknown>>(`/library/tags/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  deleteLibraryTag: async (id: number) =>
    request<void>(`/library/tags/${id}`, { method: 'DELETE' }),

  bulkAssignLibraryTags: async (
    fileIds: number[],
    tagIds: number[],
    action: 'add' | 'remove' | 'replace' = 'replace',
  ) =>
    request<Record<string, unknown>>('/library/tags/bulk-assign', {
      method: 'POST',
      body: JSON.stringify({ file_ids: fileIds, tag_ids: tagIds, action }),
    }),

  getExternalFolders: async () => {
    const folders = await request<Array<ApiEntity<LibraryFolderTree>>>('/library/folders');
    return flattenFolders(folders).filter(folder => Boolean(folder.is_external));
  },

  createExternalFolder: async (data: {
    name: string;
    external_path: string;
    readonly?: boolean;
    show_hidden?: boolean;
    parent_id?: number | null;
  }) =>
    request<Record<string, unknown>>('/library/folders/external', {
      method: 'POST', body: JSON.stringify(data),
    }),

  deleteExternalFolder: async (id: number) =>
    request<void>(`/library/folders/${id}`, { method: 'DELETE' }),

  scanExternalFolder: async (id: number) =>
    request<Record<string, unknown>>(`/library/folders/${id}/scan`, { method: 'POST' }),

  previewLibraryPurge: async (olderThanDays: number, includeNeverPrinted = true) =>
    request<Record<string, unknown>>(
      `/library/purge/preview?older_than_days=${olderThanDays}&include_never_printed=${includeNeverPrinted}`,
    ),

  purgeLibraryOldFiles: async (data: {
    older_than_days: number;
    include_never_printed?: boolean;
  }) =>
    request<Record<string, unknown>>('/library/purge', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getLibraryStats: async () => request<ApiEntity<LibraryStats>>('/library/stats'),

  bulkDeleteLibrary: async (fileIds: number[], folderIds: number[]) =>
    request<Record<string, unknown>>('/library/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ file_ids: fileIds, folder_ids: folderIds }),
    }),

  addLibraryFilesToQueue: async (fileIds: number[]) =>
    request<Record<string, unknown>>('/library/files/add-to-queue', {
      method: 'POST',
      body: JSON.stringify({ file_ids: fileIds }),
    }),

  getLibraryTrash: async (): Promise<LibraryTrashResponse> => {
    const first = await request<LibraryTrashResponse>('/library/trash?limit=500&offset=0');
    const items: Array<ApiEntity<LibraryTrashItem>> = [...first.items];
    while (items.length < first.total) {
      const page = await request<LibraryTrashResponse>(`/library/trash?limit=500&offset=${items.length}`);
      if (!page.items.length) break;
      items.push(...page.items);
    }
    return { ...first, items };
  },

  getLibraryTrashSettings: () => request<LibraryTrashSettings>('/library/trash/settings'),

  saveLibraryTrashSettings: (settings: LibraryTrashSettings) =>
    request<LibraryTrashSettings>('/library/trash/settings', {
      method: 'PUT', body: JSON.stringify(settings),
    }),

  restoreLibraryItem: async (id: number) =>
    request<void>(`/library/trash/${id}/restore`, { method: 'POST' }),

  permanentDeleteLibraryItem: async (id: number) =>
    request<void>(`/library/trash/${id}`, { method: 'DELETE' }),

  emptyLibraryTrash: async () => request<void>('/library/trash', { method: 'DELETE' }),

  getPendingUploads: async () =>
    request<Record<string, unknown>[]>('/pending-uploads/'),

  downloadFileBlob: async (id: number): Promise<Blob> =>
    requestBlob(`/library/files/${id}/download`),

  sliceFile: async (
    id: number,
    options?: {
      profile?: string;
      plate?: string;
      supports?: boolean;
      extra?: Record<string, unknown>;
    },
  ) =>
    request<Record<string, unknown>>(`/library/files/${id}/slice`, {
      method: 'POST',
      body: JSON.stringify({
        profile: options?.profile,
        plate: options?.plate,
        supports: options?.supports,
        ...(options?.extra ?? {}),
      }),
    }),
};
