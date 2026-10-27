import type { CameraTokenScope, PlateDetectionROI } from '@/types/api';

export const overlayFields = ['printer', 'model', 'filename', 'status', 'progress', 'layers', 'eta', 'nozzle', 'bed', 'chamber'] as const;
export interface OverlayOptions {
  printerId: number;
  fields: string[];
  size: 'small' | 'medium' | 'large';
  artwork: '1' | '2';
  fps: number;
  camera: boolean;
  token: string;
}

export function serverPageUrl(server: string, path: string, params: URLSearchParams) {
  const origin = new URL(server);
  if (!/^https?:$/.test(origin.protocol) || origin.username || origin.password) {
    throw new Error('Invalid server URL');
  }
  return `${origin.origin}${path}?${params.toString()}`;
}

export function overlayUrl(server: string, options: OverlayOptions) {
  const params = new URLSearchParams({
    show: overlayFields.filter(field => options.fields.includes(field)).join(','),
    size: options.size,
    artwork: options.artwork,
    fps: String(Math.max(1, Math.min(30, Math.round(options.fps)))),
    camera: String(options.camera),
  });
  if (options.token.trim()) params.set('token', options.token.trim());
  return serverPageUrl(server, `/overlay/${options.printerId}`, params);
}

export function cameraIntegrationUrl(server: string, scope: CameraTokenScope, token: string, printerId: number) {
  return serverPageUrl(server,
    scope === 'camwall' ? '/camwall' : scope === 'overlay' ? `/overlay/${printerId}` : `/api/v1/printers/${printerId}/camera/stream`,
    new URLSearchParams({ token }),
  );
}

export function validPlateRoi(roi: PlateDetectionROI) {
  return [roi.x, roi.y, roi.w, roi.h].every(Number.isFinite) &&
    roi.x >= 0 && roi.y >= 0 && roi.w > 0 && roi.h > 0 &&
    roi.x + roi.w <= 1 && roi.y + roi.h <= 1;
}

export function validExternalCameraUrl(value: string, type: string) {
  if (type === 'usb') return /^\/dev\/video\d{1,2}$/.test(value);
  try {
    const url = new URL(value);
    return (type === 'rtsp' ? ['rtsp:', 'rtsps:'] : ['http:', 'https:']).includes(url.protocol);
  } catch {
    return false;
  }
}
