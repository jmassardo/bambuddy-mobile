import { request } from './http';
import type { MakerworldImportRequest, MakerworldImportResponse } from '@/types/api';

export const makerworldApi = {
  importInstance: (data: MakerworldImportRequest) =>
    request<MakerworldImportResponse>('/makerworld/import', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteImport: (fileId: number) =>
    request<void>(`/library/files/${fileId}`, { method: 'DELETE' }),
};
