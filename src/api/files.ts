import type {
  ApiEntity,
  LibraryFile,
  LibraryFileListItem,
  LibraryFolderTree,
  LibraryStats,
  LibraryTrashItem,
  LibraryTrashSettings,
} from '@/types/api';
import {
  ApiError,
  buildMediaUrl,
  request,
  requestTextWithFallback,
  requestWithFallback,
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
    const query = params.toString();
    return request<Array<ApiEntity<LibraryFileListItem>>>(
      `/library/files${query ? `?${query}` : ''}`,
    );
  },

  getLibraryFile: async (id: number) =>
    requestWithFallback<ApiEntity<LibraryFile>>(
      { endpoint: `/library/files/${id}` },
      { endpoint: `/library/${id}` },
    ),

  createFolder: async (data: { name: string; parent_id?: number }) =>
    request<Record<string, unknown>>('/library/folders', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  renameLibraryItem: async (id: number, name: string) =>
    request<Record<string, unknown>>(`/library/files/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ print_name: name }),
    }),

  moveLibraryItem: async (id: number, folderId: number | null) =>
    request<Record<string, unknown>>('/library/files/move', {
      method: 'POST',
      body: JSON.stringify({ file_ids: [id], folder_id: folderId }),
    }),

  deleteLibraryItem: async (id: number) =>
    request<void>(`/library/files/${id}`, { method: 'DELETE' }),

  uploadLibraryFile: async (
    file: UploadableFile,
    folderId?: number | null,
    onProgress?: (progress: number) => void,
  ) => {
    const params = new URLSearchParams();
    if (folderId != null) {
      params.set('folder_id', String(folderId));
    }
    params.set('generate_stl_thumbnails', 'true');
    const primaryEndpoint = `/library/files${params.toString() ? `?${params}` : ''}`;
    const fallbackEndpoint =
      folderId != null ? `/library/upload?folder_id=${folderId}` : '/library/upload';

    try {
      if (onProgress) {
        return await uploadFileWithProgress<Record<string, unknown>>(
          primaryEndpoint,
          file,
          onProgress,
        );
      }
      return await uploadFile<Record<string, unknown>>(primaryEndpoint, file);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) {
        throw error;
      }
      if (onProgress) {
        return uploadFileWithProgress<Record<string, unknown>>(
          fallbackEndpoint,
          file,
          onProgress,
        );
      }
      return uploadFile<Record<string, unknown>>(fallbackEndpoint, file);
    }
  },

  getLibraryFilePlates: async (id: number) =>
    requestWithFallback<Record<string, unknown>>(
      { endpoint: `/library/files/${id}/plates` },
      { endpoint: `/library/${id}/plates` },
    ),

  getLibraryFileFilamentRequirements: async (id: number, plateId?: number) => {
    const params = new URLSearchParams();
    if (plateId !== undefined) {
      params.set('plate_id', String(plateId));
    }
    const query = params.toString();

    return requestWithFallback<Record<string, unknown>>(
      {
        endpoint: `/library/files/${id}/filament-requirements${query ? `?${query}` : ''}`,
      },
      {
        endpoint: `/library/${id}/filament-requirements${query ? `?${query}` : ''}`,
      },
    );
  },

  getLibraryFilePlateThumbnail: (id: number, plateIndex: number): string =>
    buildMediaUrl(`/library/${id}/plates/${plateIndex}/thumbnail`),

  getLibraryFileThumbnailUrl: (id: number): string =>
    buildMediaUrl(`/library/files/${id}/thumbnail`),

  getLibraryFileDownloadUrl: (id: number): string =>
    buildMediaUrl(`/library/files/${id}/download`),

  getLibraryFileText: async (id: number) =>
    requestTextWithFallback(
      { endpoint: `/library/files/${id}/download` },
      { endpoint: `/library/${id}/download` },
    ),

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
    try {
      return await request<Array<ApiEntity<LibraryFolderTree>>>(
        '/library/external-folders',
      );
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
      const folders = await request<Array<ApiEntity<LibraryFolderTree>>>(
        '/library/folders',
      );
      return flattenFolders(folders).filter(folder => Boolean(folder.is_external));
    }
  },

  createExternalFolder: async (data: {
    name: string;
    external_path: string;
    readonly?: boolean;
    show_hidden?: boolean;
    parent_id?: number | null;
  }) =>
    requestWithFallback<Record<string, unknown>>(
      {
        endpoint: '/library/external-folders',
        options: { method: 'POST', body: JSON.stringify(data) },
      },
      {
        endpoint: '/library/folders/external',
        options: { method: 'POST', body: JSON.stringify(data) },
      },
    ),

  deleteExternalFolder: async (id: number) =>
    requestWithFallback<void>(
      { endpoint: `/library/external-folders/${id}`, options: { method: 'DELETE' } },
      { endpoint: `/library/folders/${id}`, options: { method: 'DELETE' } },
    ),

  scanExternalFolder: async (id: number) =>
    requestWithFallback<Record<string, unknown>>(
      { endpoint: `/library/external-folders/${id}/scan`, options: { method: 'POST' } },
      { endpoint: `/library/folders/${id}/scan`, options: { method: 'POST' } },
    ),

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

  getLibraryTrash: async () =>
    request<Array<ApiEntity<LibraryTrashItem>>>('/library/trash'),

  restoreLibraryItem: async (id: number) =>
    request<void>(`/library/trash/${id}/restore`, { method: 'POST' }),

  permanentDeleteLibraryItem: async (id: number) =>
    request<void>(`/library/trash/${id}`, { method: 'DELETE' }),

  emptyLibraryTrash: async () => request<void>('/library/trash', { method: 'DELETE' }),

  extractZip: async (fileId: number, folderId?: number | null) =>
    request<void>('/library/files/extract', {
      method: 'POST',
      body: JSON.stringify({ file_id: fileId, folder_id: folderId }),
    }),

  getLibraryTrashSettings: async () =>
    request<ApiEntity<LibraryTrashSettings>>('/library/trash/settings'),

  updateLibraryTrashSettings: async (data: Record<string, unknown>) =>
    request<ApiEntity<LibraryTrashSettings>>('/library/trash/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getPendingUploads: async () =>
    request<Record<string, unknown>[]>('/pending-uploads/'),
};
