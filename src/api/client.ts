import { archivesApi } from './archives';
import { authApi } from './auth';
import { backupApi } from './backup';
import { filesApi } from './files';
import {
  ApiError,
  AUTH_TOKEN_KEY,
  buildMediaUrl,
  checkAuthStatus,
  clearAuthTokenForServer,
  getCameraStreamToken,
  getAuthToken,
  loadAuthToken,
  MEDIA_TOKEN_SCOPE,
  request,
  requestBlob,
  requestText,
  requestTextWithFallback,
  requestWithFallback,
  setAuthToken,
  setStreamToken,
  uploadFile,
  uploadFileWithProgress,
  withStreamToken,
} from './http';
import { inventoryApi } from './inventory';
import { maintenanceApi } from './maintenance';
import { printersApi } from './printers';
import { profilesApi } from './profiles';
import { projectsApi } from './projects';
import { queueApi } from './queue';
import { settingsApi } from './settings';
import { systemApi } from './system';

export const api = {
  ...authApi,
  ...printersApi,
  ...archivesApi,
  ...queueApi,
  ...filesApi,
  ...projectsApi,
  ...inventoryApi,
  ...maintenanceApi,
  ...settingsApi,
  ...profilesApi,
  ...backupApi,
  ...systemApi,
  getCameraStreamToken,
};

export {
  ApiError,
  AUTH_TOKEN_KEY,
  buildMediaUrl,
  checkAuthStatus,
  clearAuthTokenForServer,
  getCameraStreamToken,
  getAuthToken,
  loadAuthToken,
  MEDIA_TOKEN_SCOPE,
  request,
  requestBlob,
  requestText,
  requestTextWithFallback,
  requestWithFallback,
  setAuthToken,
  setStreamToken,
  uploadFile,
  uploadFileWithProgress,
  withStreamToken,
};
