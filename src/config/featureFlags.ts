/**
 * Build-scoped flags. Release builds keep the native transport disabled until
 * its physical-device acceptance gate passes. Diagnostic builds may produce a
 * dedicated bundle with this value enabled; there is intentionally no runtime
 * or remote override.
 */
export const featureFlags = Object.freeze({
  camera_ios_native_mjpeg_v1: false,
});
