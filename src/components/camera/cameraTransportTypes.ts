export type CameraTransportMode =
  | 'snapshot-preflight'
  | 'native-mjpeg'
  | 'snapshot-fallback';

export type CameraTransportPhase =
  | 'request'
  | 'redirect'
  | 'response'
  | 'parse'
  | 'decode'
  | 'timeout';

export type CameraTransportError =
  | 'ats_blocked'
  | 'local_network_denied_or_unreachable'
  | 'tls_failed'
  | 'dns_failed'
  | 'timeout'
  | 'cancelled'
  | 'redirect_blocked'
  | 'redirect_limit'
  | 'http_401'
  | 'http_403'
  | 'http_404'
  | 'http_5xx'
  | 'http_other'
  | 'mime_invalid'
  | 'boundary_missing'
  | 'frame_too_large'
  | 'buffer_limit'
  | 'jpeg_invalid'
  | 'decode_failed'
  | 'stream_ended'
  | 'native_unavailable';

export type IOSCameraEvent = {
  type: 'response' | 'first-frame' | 'mode-changed' | 'failure';
  attemptId: string;
  mode: CameraTransportMode;
  phase: CameraTransportPhase;
  httpStatus?: number;
  mimeType?: string;
  redirectCount?: number;
  bytesReceived?: number;
  firstBytesSignature?:
    | 'jpeg-soi'
    | 'multipart-boundary'
    | 'html'
    | 'json'
    | 'empty'
    | 'other';
  nsUrlErrorCode?: number;
  errorCode?: CameraTransportError;
  width?: number;
  height?: number;
  elapsedMs?: number;
};

const nativeMJPEGSnapshotFallbackErrors: ReadonlySet<CameraTransportError> =
  new Set([
    'timeout',
    'mime_invalid',
    'boundary_missing',
    'frame_too_large',
    'buffer_limit',
    'jpeg_invalid',
    'decode_failed',
    'stream_ended',
  ]);

export function transitionsImmediatelyToSnapshotFallback(
  event: IOSCameraEvent,
): boolean {
  return (
    event.type === 'failure' &&
    event.mode === 'native-mjpeg' &&
    event.errorCode != null &&
    nativeMJPEGSnapshotFallbackErrors.has(event.errorCode)
  );
}
