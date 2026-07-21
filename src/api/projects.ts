import {
  buildMediaUrl,
  request,
  requestBlob,
  requestWithFallback,
  uploadFile,
  type UploadableFile,
} from './http';

export const projectsApi = {
  getProjects: async () => request<Record<string, unknown>[]>('/projects/'),

  getProject: async (id: number) => request<Record<string, unknown>>(`/projects/${id}`),

  createProject: async (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('/projects/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateProject: async (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteProject: async (id: number) => request<void>(`/projects/${id}`, { method: 'DELETE' }),

  getProjectArchives: async (id: number, limit = 100, offset = 0) =>
    request<Record<string, unknown>[]>(
      `/projects/${id}/archives?limit=${limit}&offset=${offset}`,
    ),

  sliceProject: async (id: number, data: Record<string, unknown>) =>
    requestWithFallback<Record<string, unknown>>(
      {
        endpoint: `/projects/${id}/slice`,
        options: {
          method: 'POST',
          body: JSON.stringify(data),
        },
      },
      {
        endpoint: '/slicer/slice',
        options: {
          method: 'POST',
          body: JSON.stringify({ project_id: id, ...data }),
        },
      },
    ),

  getProjectBOM: async (projectId: number) =>
    request<Record<string, unknown>[]>(`/projects/${projectId}/bom`),

  createBOMItem: async (projectId: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/projects/${projectId}/bom`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateBOMItem: async (
    projectId: number,
    itemId: number,
    data: Record<string, unknown>,
  ) =>
    request<Record<string, unknown>>(
      `/projects/${projectId}/bom/${itemId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      },
    ),

  deleteBOMItem: async (projectId: number, itemId: number) =>
    request<void>(`/projects/${projectId}/bom/${itemId}`, {
      method: 'DELETE',
    }),

  getProjectTimeline: async (projectId: number, limit = 50) =>
    request<Record<string, unknown>[]>(
      `/projects/${projectId}/timeline?limit=${limit}`,
    ),

  getProjectCoverImageUrl: (projectId: number): string =>
    buildMediaUrl(`/projects/${projectId}/cover-image`),

  uploadProjectCoverImage: async (projectId: number, file: UploadableFile) =>
    uploadFile<Record<string, unknown>>(`/projects/${projectId}/cover-image`, file),

  deleteProjectCoverImage: async (projectId: number) =>
    request<void>(`/projects/${projectId}/cover-image`, {
      method: 'DELETE',
    }),

  exportProjectZip: async (projectId: number) =>
    requestBlob(`/projects/${projectId}/export`),
};
