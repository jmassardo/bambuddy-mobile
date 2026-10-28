import { NativeTranslation, nativeMessage, translateNative, useLocalizedMemo, useNativeLocale, useTranslation } from '@/i18n';


import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  useFocusEffect,
  useIsFocused,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import type { RootNavigationProp, RootRouteProp } from '@/navigation/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Layers,
  Lightbulb,
  Maximize,
  Minimize,
  MinusCircle,
  MoreHorizontal,
  RefreshCw,
  X,
  XCircle,
} from 'lucide-react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { api, ApiError, getAuthToken } from '@/api/client';
import { useServerStore } from '@/api/server';
import { PrimaryButton, StatusBadge } from '@/components/common/AppUI';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
import type {
  CameraDiagnoseResult,
  DiagnosticCheck,
  DiagnosticStatus,
  PlateDetectionROI,
  Printer,
  PrinterDiagnosticResult,
} from '@/types/api';
import { withCacheBuster } from '@/utils/data';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMediaToken } from '@/hooks/useStreamToken';
import { useStreamRetry, type RetryState } from '@/hooks/useStreamRetry';
import { useStreamHealth, type StreamHealthStatus } from '@/hooks/useStreamHealth';
import { WebView } from 'react-native-webview';
import { camerasApi } from '@/api/cameras';
import { CameraSnapshot } from '@/components/printers/CameraSnapshot';
import { PlateManagement } from '@/components/printers/PlateManagement';
import { SkipObjectsModal } from '@/components/printers/SkipObjectsModal';

interface CameraWebViewProps {
  key?: string;
  source: { uri: string };
  style: object;
  originWhitelist: string[];
  injectedJavaScriptBeforeContentLoaded: string;
  injectedJavaScriptBeforeContentLoadedForMainFrameOnly: boolean;
  javaScriptEnabled: boolean;
  incognito: boolean;
  sharedCookiesEnabled: boolean;
  useSharedProcessPool: boolean;
  javaScriptCanOpenWindowsAutomatically: boolean;
  allowFileAccessFromFileURLs: boolean;
  allowUniversalAccessFromFileURLs: boolean;
  allowsLinkPreview: boolean;
  onShouldStartLoadWithRequest: (request: { url: string }) => boolean;
  onOpenWindow: () => void;
  onFileDownload: () => void;
  onError: () => void;
  onHttpError: (event: { nativeEvent?: { statusCode?: number } }) => void;
  onContentProcessDidTerminate: () => void;
}

interface CameraWebViewHandle {
  injectJavaScript: (script: string) => void;
}

const CameraWebView = WebView as React.ComponentType<
  CameraWebViewProps & React.RefAttributes<CameraWebViewHandle>
>;

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function isCameraLandscape(width: number, height: number) {
  return width > height;
}

export function shouldHideCameraStatusBar(isFocused: boolean) {
  return isFocused;
}

function stripExtension(name: string | null | undefined) {
  if (!name) return 'No active print';
  return name.replace(/\.(gcode|3mf)$/i, '');
}

function getErrorMessage<T extends string | import('@/i18n').NativeMessage>(error: unknown, fallback: T) {
  return error instanceof ApiError ? error.message : fallback;
}

function getStatusLabel(state: string | null | undefined, stage: string | null | undefined) {
  if (stage) return stage;
  if (!state) return translateNative('native.ff12a040d13addb7');
  return state.charAt(0) + state.slice(1).toLowerCase();
}

function ConnectionCheckIcon({ status, colors }: { status: DiagnosticStatus; colors: ReturnType<typeof useTheme>['colors'] }) {
  useNativeLocale();
  if (status === 'pass') return <CheckCircle2 size={16} color={colors.success} strokeWidth={2} />;
  if (status === 'fail') return <XCircle size={16} color={colors.error} strokeWidth={2} />;
  if (status === 'warn') return <AlertTriangle size={16} color={colors.warning} strokeWidth={2} />;
  return <MinusCircle size={16} color={colors.textTertiary} strokeWidth={2} />;
}

function StreamStatusIndicator({
  retryState,
  healthStatus,
  retryCount,
  maxRetries,
  refreshCount,
  colors,
}: {
  retryState: RetryState;
  healthStatus: StreamHealthStatus;
  retryCount: number;
  maxRetries: number;
  refreshCount: number;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  useNativeLocale();
  const isRetryActive = retryState === 'retrying';
  const isRetryFailed = retryState === 'failed';
  const isDegraded = healthStatus === 'degraded';
  const isStale = healthStatus === 'stale';
  const isOffline = healthStatus === 'offline';

  if (!isRetryActive && !isRetryFailed && !isDegraded && !isStale && !isOffline && refreshCount < 2) {
    return null;
  }

  let label = '';
  let iconColor: string = colors.accent;

  if (isRetryActive) {
    label = `Retrying… (${retryCount}/${maxRetries})`;
    iconColor = colors.warning;
  } else if (isRetryFailed) {
    label = translateNative('native.fa6a6012f1a96f9f');
    iconColor = colors.error;
  } else if (isDegraded) {
    label = translateNative('native.786c3e3a90c01329');
    iconColor = colors.warning;
  } else if (isStale) {
    label = translateNative('native.4115fa2b3f086e66');
    iconColor = colors.error;
  } else if (isOffline) {
    label = translateNative('native.cfa8023948d7265f');
    iconColor = colors.error;
  }

  if (!label) return null;

  return (
    <View
      style={[
        styles.streamStatusBadge,
        { backgroundColor: `${iconColor}15`, borderColor: `${iconColor}40` },
      ]}
    >
      <View style={styles.streamStatusIconContainer}>
        {isRetryActive ? (
          <ActivityIndicator size="small" color={iconColor} />
        ) : isDegraded ? (
          <AlertTriangle size={14} color={iconColor} strokeWidth={2} />
        ) : (
          <XCircle size={14} color={iconColor} strokeWidth={2} />
        )}
      </View>
      <Text style={[styles.streamStatusText, { color: iconColor }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function CameraStageIcon({ status, colors }: { status: CameraDiagnoseResult['stages'][number]['status']; colors: ReturnType<typeof useTheme>['colors'] }) {
  useNativeLocale();
  if (status === 'ok') return <CheckCircle2 size={16} color={colors.success} strokeWidth={2} />;
  if (status === 'failed') return <XCircle size={16} color={colors.error} strokeWidth={2} />;
  return <MinusCircle size={16} color={colors.textTertiary} strokeWidth={2} />;
}

function checkTitle(check: DiagnosticCheck) {
  switch (check.id) {
    case 'port_mqtt':
      return translateNative('native.3c3696e708e1f828');
    case 'port_ftps':
      return translateNative('native.784839834f951f71');
    case 'port_rtsps':
      return translateNative('native.179efddcee7a4388');
    case 'network_mode':
      return translateNative('native.0b3871bb03c278d3');
    case 'subnet':
      return translateNative('native.c49ad22ecb477baa');
    case 'mqtt_auth':
      return translateNative('native.21fc7ded6ed9e133');
    case 'developer_mode':
      return translateNative('native.248967b35e8cf486');
    default:
      return String(check.id).replace(/_/g, ' ');
  }
}

function stageTitle(name: CameraDiagnoseResult['stages'][number]['name']) {
  switch (name) {
    case 'tcp_reachable':
      return translateNative('native.9a8e41fd91c7762a');
    case 'first_frame':
      return translateNative('native.66f6568fe584ff60');
    case 'live_stream_active':
      return translateNative('native.004d4a4f79e21e45');
    default:
      return String(name).replace(/_/g, ' ');
  }
}

function overallSummary(result: PrinterDiagnosticResult) {
  if (result.overall === 'ok') return translateNative('native.e7a9c1809381dd99');
  if (result.overall === 'warnings') return translateNative('native.e63d0b2ca9648926');
  return translateNative('native.82033d1f7e46a73d');
}

function cameraSummary(result: CameraDiagnoseResult) {
  if (result.overall_status === 'ok') return translateNative('native.d0219234d1450e08');
  switch (result.summary_code) {
    case 'stream_unreachable':
      return translateNative('native.c771a3b5bfb356cf');
    case 'first_frame_timeout':
      return translateNative('native.e91ec19a40d5bab1');
    case 'live_stream_inactive':
      return translateNative('native.b2326af16790aa86');
    default:
      return translateNative('native.278d797faf41294e');
  }
}

function DiagnosticSheet({
  visible,
  onClose,
  onRetry,
  pending,
  result,
  printer,
  reduceMotionEnabled,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  onRetry: () => void;
  pending: boolean;
  result: {
    connection: PrinterDiagnosticResult | null;
    camera: CameraDiagnoseResult | null;
    connectionError?: string | null;
    cameraError?: string | null;
  } | null;
  printer: Printer | null;
  reduceMotionEnabled: boolean;
  children: React.ReactNode;
}) {
  useNativeLocale();
  const { colors } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotionEnabled ? 'none' : 'slide'}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}> 
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          accessibilityViewIsModal
          style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderText}>
              <Text accessibilityRole="header" style={[styles.modalTitle, { color: colors.text }]}>
                {translateNative('native.e6b9b7ed4a2e9f36')}</Text>
              <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                {printer?.name || translateNative('native.98976bae8adbae3e')}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={translateNative('native.de5f51ead319ff0c')}
              accessibilityHint={translateNative('native.f71b5a8e7f089f60')}
              hitSlop={8}
              onPress={onClose}
              style={styles.iconButton}
            >
              <X size={18} color={colors.textSecondary} strokeWidth={2} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody}>
            {children}
            {pending ? (
              <View style={styles.loadingState}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={[styles.modalHint, { color: colors.textSecondary }]}>{translateNative('native.977a97965b66581e')}</Text>
              </View>
            ) : null}

            {result?.connection ? (
              <View style={[styles.diagSection, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
                <View style={styles.diagSectionHeader}>
                  <Text style={[styles.diagTitle, { color: colors.text }]}>{translateNative('native.4ec13eeb4266f059')}</Text>
                  <StatusBadge
                    label={result.connection.overall}
                    color={
                      result.connection.overall === 'ok'
                        ? colors.success
                        : result.connection.overall === 'warnings'
                          ? colors.warning
                          : colors.error
                    }
                  />
                </View>
                <Text style={[styles.modalHint, { color: colors.textSecondary }]}>{overallSummary(result.connection)}</Text>
                {result.connection.checks.map(check => (
                  <View key={check.id} style={[styles.diagRow, { borderColor: colors.borderSubtle }]}> 
                    <ConnectionCheckIcon status={check.status} colors={colors} />
                    <View style={styles.diagRowText}>
                      <Text style={[styles.diagRowTitle, { color: colors.text }]}>{checkTitle(check)}</Text>
                      {Object.keys(check.params).length > 0 ? (
                        <Text style={[styles.diagRowBody, { color: colors.textSecondary }]}>
                          {Object.entries(check.params)
                            .map(([key, value]) => `${key}: ${value}`)
                            .join(' · ')}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {result?.connectionError ? (
              <View style={[styles.errorBox, { backgroundColor: `${colors.error}15`, borderColor: `${colors.error}40` }]}> 
                <Text style={[styles.errorTitle, { color: colors.error }]}>{translateNative('native.683bb478f542c082')}</Text>
                <Text style={[styles.errorMessage, { color: colors.textSecondary }]}>{result.connectionError}</Text>
              </View>
            ) : null}

            {result?.camera ? (
              <View style={[styles.diagSection, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
                <View style={styles.diagSectionHeader}>
                  <Text style={[styles.diagTitle, { color: colors.text }]}>{translateNative('native.47e67fbc27c433bb')}</Text>
                  <StatusBadge
                    label={result.camera.overall_status}
                    color={result.camera.overall_status === 'ok' ? colors.success : colors.error}
                  />
                </View>
                <Text style={[styles.modalHint, { color: colors.textSecondary }]}>{cameraSummary(result.camera)}</Text>
                {result.camera.stages.map(stage => (
                  <View key={stage.name} style={[styles.diagRow, { borderColor: colors.borderSubtle }]}> 
                    <CameraStageIcon status={stage.status} colors={colors} />
                    <View style={styles.diagRowText}>
                      <Text style={[styles.diagRowTitle, { color: colors.text }]}>{stageTitle(stage.name)}</Text>
                      <Text style={[styles.diagRowBody, { color: colors.textSecondary }]}><NativeTranslation id="native.cf42037063436f46" values={{ value0: (stage.duration_ms), value1: (stage.code ? ` · ${stage.code}` : '') }} /></Text>
                    </View>
                  </View>
                ))}
                <Text style={[styles.modalHint, { color: colors.textSecondary }]}><NativeTranslation id="native.85977c384a207e27" values={{ value0: (result.camera.protocol), value1: (result.camera.port), value2: (result.camera.profile) }} /></Text>
              </View>
            ) : null}

            {result?.cameraError ? (
              <View style={[styles.errorBox, { backgroundColor: `${colors.warning}15`, borderColor: `${colors.warning}40` }]}> 
                <Text style={[styles.errorTitle, { color: colors.warning }]}>{translateNative('native.0665dd71e884c291')}</Text>
                <Text style={[styles.errorMessage, { color: colors.textSecondary }]}>{result.cameraError}</Text>
              </View>
            ) : null}

            {!pending && !result?.connection && !result?.camera && !result?.connectionError && !result?.cameraError ? (
              <Text style={[styles.modalHint, { color: colors.textSecondary }]}>{translateNative('native.6d7cdb71de56a1a4')}</Text>
            ) : null}
          </ScrollView>

          <View style={styles.modalActions}>
            <PrimaryButton
              label={pending ? translateNative('native.4d09977f8d9eacf6') : result ? translateNative('native.0fc6f54663b84a38') : translateNative('native.1b6cb432698b3f22')}
              variant="secondary"
              onPress={onRetry}
              disabled={pending}
            />
            <PrimaryButton label={translateNative('common.close')} onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const MAX_CAMERA_ZOOM = 4;
export const CAMERA_STREAM_TIMEOUT_MS = 15_000;
const IOS_INITIAL_STREAM_TIMEOUT_MS = 30_000;
const IOS_RETRY_STREAM_TIMEOUT_MS = 20_000;
const STREAM_RETRY_MAX_RETRIES = 3;
const STREAM_RETRY_INITIAL_DELAY_MS = 1000;
const STREAM_RETRY_MAX_DELAY_MS = 10_000;
const STREAM_STALE_THRESHOLD_MS = 10_000;
const STREAM_DEGRADED_THRESHOLD_MS = 5_000;
const DEFAULT_PLATE_ROI: PlateDetectionROI = {
  x: 0.18,
  y: 0.2,
  w: 0.64,
  h: 0.44,
};

function CameraIconButton({
  label,
  hint,
  onPress,
  icon,
  disabled = false,
  selected = false,
  busy = false,
  style,
}: {
  label: string;
  hint: string;
  onPress: () => void;
  icon: React.ReactNode;
  disabled?: boolean;
  selected?: boolean;
  busy?: boolean;
  style?: object;
}) {
  useNativeLocale();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled, selected, busy }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={[styles.iconButton, disabled && styles.disabledButton, style]}
    >
      {icon}
    </Pressable>
  );
}

function serializeCameraAuthBootstrap(token: string | null) {
  if (token == null) return '';
  const serializedToken = JSON.stringify(token)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `window.sessionStorage.removeItem("auth_token"); window.sessionStorage.setItem("auth_token", ${serializedToken});`;
}

function createCameraPresentationScript(objectFit: 'contain' | 'cover') {
  return `
    (() => {
      const namespace = '__bambuddyMobileCameraStyling';
      const styleId = 'bambuddy-mobile-camera-style';
      const previous = window[namespace];
      if (previous && typeof previous.cleanup === 'function') previous.cleanup();

      let observer = null;
      let debounceTimer = null;

      const cleanup = () => {
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        if (debounceTimer !== null) {
          window.clearTimeout(debounceTimer);
          debounceTimer = null;
        }
      };

      const apply = () => {
        if (!document.head) return;
        const root = document.getElementById('root');
        const page = root && root.firstElementChild;
        const image = page && page.querySelector('img');
        const stream = image && image.parentElement;
        const content = stream && stream.parentElement;
        if (
          !root ||
          !page ||
          page.parentElement !== root ||
          !image ||
          !stream ||
          image.parentElement !== stream ||
          !content ||
          stream.parentElement !== content ||
          content.parentElement !== page
        ) return;

        let style = document.getElementById(styleId);
        if (!style) {
          style = document.createElement('style');
          style.id = styleId;
          style.textContent = \`
            html, body, #root {
              width: 100% !important;
              width: 100vw !important;
              height: 100% !important;
              height: 100dvh !important;
              min-height: 100% !important;
              min-height: 100dvh !important;
              margin: 0 !important;
              padding: 0 !important;
              border: 0 !important;
              overflow: hidden !important;
              background: #000 !important;
              box-sizing: border-box !important;
            }
            html, body {
              position: fixed !important;
              inset: 0 !important;
            }
            #root,
            [data-bambuddy-mobile-camera-page],
            [data-bambuddy-mobile-camera-content],
            [data-bambuddy-mobile-camera-stream] {
              position: absolute !important;
              inset: 0 !important;
              top: 0 !important;
            }
            [data-bambuddy-mobile-camera-page],
            [data-bambuddy-mobile-camera-content],
            [data-bambuddy-mobile-camera-stream] {
              width: 100% !important;
              width: 100vw !important;
              height: 100% !important;
              height: 100dvh !important;
              min-width: 0 !important;
              min-height: 0 !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: hidden !important;
            }
            [data-bambuddy-mobile-camera-stream] {
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              background: #000 !important;
            }
            [data-bambuddy-mobile-camera-stream] > img {
              width: 100% !important;
              height: 100% !important;
              max-width: none !important;
              max-height: none !important;
              object-fit: ${objectFit} !important;
            }
            [data-bambuddy-mobile-camera-hidden] {
              display: none !important;
            }
          \`;
          document.head.appendChild(style);
        } else {
          const updatedStyleText = style.textContent.replace(
            /object-fit: (?:contain|cover) !important/,
            'object-fit: ${objectFit} !important',
          );
          if (updatedStyleText !== style.textContent) {
            style.textContent = updatedStyleText;
          }
        }

        page.setAttribute('data-bambuddy-mobile-camera-page', '');
        content.setAttribute('data-bambuddy-mobile-camera-content', '');
        stream.setAttribute('data-bambuddy-mobile-camera-stream', '');

        const header = Array.from(page.children).find(
          child =>
            child !== content &&
            child.parentElement === page &&
            child.querySelector('h1') &&
            child.querySelector('button'),
        );
        if (header) header.setAttribute('data-bambuddy-mobile-camera-hidden', '');

        const zoomControls = Array.from(stream.children).find(
          child => {
            if (child === image || child.parentElement !== stream) return false;
            const buttons = Array.from(child.children).filter(
              control => control.tagName === 'BUTTON',
            );
            return (
              buttons.length === 3 &&
              child.children.length === 3 &&
              /^\\s*\\d{1,3}(?:\\.\\d+)?%\\s*$/.test(buttons[1].textContent || '')
            );
          },
        );
        if (zoomControls) {
          zoomControls.setAttribute('data-bambuddy-mobile-camera-hidden', '');
        }
      };

      window[namespace] = { apply, cleanup };
      apply();
      observer = new MutationObserver(() => {
        if (debounceTimer !== null) window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
          debounceTimer = null;
          apply();
        }, 50);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    })();
    true;
  `;
}

function createCameraBootstrap(
  token: string | null,
  objectFit: 'contain' | 'cover',
) {
  return `${serializeCameraAuthBootstrap(token)}${createCameraPresentationScript(objectFit)}`;
}

function clampTranslationOffset(value: number, axisSize: number, scale: number) {
  'worklet';
  const maxOffset = Math.max(0, ((axisSize * scale) - axisSize) / 2);
  return Math.max(-maxOffset, Math.min(maxOffset, value));
}

export default function CameraScreen() {
  const titleLocale = useNativeLocale();
  const { t } = useTranslation();
  const navigation = useNavigation<RootNavigationProp<'Camera'>>();
  const route = useRoute<RootRouteProp<'Camera'>>();
  const isFocused = useIsFocused();
  const { width, height } = useWindowDimensions();
  const isLandscape = isCameraLandscape(width, height);
  const { colors } = useTheme();
  const { showToast } = useToast();
  const { authEnabled, hasPermission, user } = useAuth();
  const serverUrl = useServerStore(state => state.serverUrl);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { token: mediaToken, isReady: mediaTokenReady } = useMediaToken();
  const [streamRetryCount, setStreamRetryCount] = useState(0);
  const [playbackMode, setPlaybackMode] = useState<'live' | 'snapshot'>('live');
  const streamRetry = useStreamRetry({
    maxRetries: STREAM_RETRY_MAX_RETRIES,
    initialDelayMs: STREAM_RETRY_INITIAL_DELAY_MS,
    maxDelayMs: STREAM_RETRY_MAX_DELAY_MS,
    enabled: playbackMode === 'live',
  });
  const streamHealth = useStreamHealth({
    staleThresholdMs: STREAM_STALE_THRESHOLD_MS,
    degradedThresholdMs: STREAM_DEGRADED_THRESHOLD_MS,
    autoRefreshEnabled: playbackMode === 'live',
  });
  const { refresh: refreshStreamHealth, recordFrame: recordStreamFrame } = streamHealth;
  const { retry: retryStream, recover: recoverStream, reset: resetStreamRetry } = streamRetry;
  const [fitMode, setFitMode] = useState<'cover' | 'contain'>('contain');
  const [streamSeed, setStreamSeed] = useState(() => Date.now());
  const [streamLoading, setStreamLoading] = useState(true);
  const [streamError, setStreamError] = useState(false);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [showSkipObjects, setShowSkipObjects] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [plateDetectionEnabled, setPlateDetectionEnabled] = useState(false);
  const [webAuthToken, setWebAuthToken] = useState<string | null>(null);
  const webAuthTokenRef = useRef<string | null>(null);
  const [webRendererEligible, setWebRendererEligible] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const [webViewGeneration, setWebViewGeneration] = useState(0);
  const [webCameraErrorStatus, setWebCameraErrorStatus] = useState<number | null>(null);
  const [webCameraFailed, setWebCameraFailed] = useState(false);
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webViewRef = useRef<CameraWebViewHandle>(null);
  const iosInitialLoad = useRef(true);
  const iosRetryCount = useRef(0);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const containerWidth = useSharedValue(0);
  const containerHeight = useSharedValue(0);

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: translateNative('native.ac1081d67c0eb4a3'), headerShown: false });
  }, [navigation, titleLocale]);

  const { id } = (route.params ?? {}) as { id?: string | number };
  const printerId = Number(id);
  const validPrinterId = Number.isFinite(printerId) && printerId > 0;
  const activePrinterIdRef = useRef(printerId);

  const synchronizeWebAuthToken = useCallback((forceRemount: boolean) => {
    if (Platform.OS !== 'ios') return;
    const currentToken = getAuthToken();
    if (forceRemount || currentToken !== webAuthTokenRef.current) {
      webAuthTokenRef.current = currentToken;
      setWebAuthToken(currentToken);
      setWebViewGeneration(current => current + 1);
    }
    setWebRendererEligible(true);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    if (!isFocused || appState !== 'active' || (authEnabled && !user)) {
      setWebRendererEligible(false);
      if (authEnabled && !user) {
        webAuthTokenRef.current = null;
        setWebAuthToken(null);
      }
      return;
    }
    setWebRendererEligible(false);
    synchronizeWebAuthToken(false);
  }, [appState, authEnabled, isFocused, synchronizeWebAuthToken, user]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === 'ios' && AppState.currentState === 'active') {
        setWebRendererEligible(false);
        synchronizeWebAuthToken(false);
      }
    }, [synchronizeWebAuthToken]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotionEnabled);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotionEnabled,
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    setShowDiagnostic(false);
    const clampedX = clampTranslationOffset(translateX.value, width, scale.value);
    const clampedY = clampTranslationOffset(translateY.value, height, scale.value);
    translateX.value = clampedX;
    translateY.value = clampedY;
    savedTranslateX.value = clampedX;
    savedTranslateY.value = clampedY;
  }, [
    height,
    savedTranslateX,
    savedTranslateY,
    scale,
    translateX,
    translateY,
    width,
  ]);

  const webCamera = useLocalizedMemo(() => {
    if (Platform.OS !== 'ios' || !validPrinterId || !serverUrl) return null;
    try {
      const configuredUrl = new URL(serverUrl);
      if (
        (configuredUrl.protocol !== 'http:' && configuredUrl.protocol !== 'https:') ||
        configuredUrl.username ||
        configuredUrl.password
      ) {
        return null;
      }
      const pathname = `/camera/${encodeURIComponent(String(printerId))}`;
      return {
        origin: configuredUrl.origin,
        pathname,
        uri: `${configuredUrl.origin}${pathname}`,
      };
    } catch {
      return null;
    }
  }, [printerId, serverUrl, validPrinterId]);

  const cameraBootstrap = useLocalizedMemo(
    () => createCameraBootstrap(webAuthToken, fitMode),
    [fitMode, webAuthToken],
  );

  const allowCameraNavigation = useCallback(
    (request: { url: string }) => {
      if (!webCamera) return false;
      try {
        const candidate = new URL(request.url);
        return (
          (candidate.protocol === 'http:' || candidate.protocol === 'https:') &&
          candidate.username === '' &&
          candidate.password === '' &&
          candidate.origin === webCamera.origin &&
          candidate.pathname === webCamera.pathname &&
          candidate.search === '' &&
          candidate.hash === ''
        );
      } catch {
        return false;
      }
    },
    [webCamera],
  );

  const handleWebCameraFailure = useCallback(() => {
    setWebCameraErrorStatus(null);
    setWebCameraFailed(true);
    if (Platform.OS === 'ios' && iosRetryCount.current < 2) {
      iosRetryCount.current += 1;
      setTimeout(() => {
        iosInitialLoad.current = true;
        setWebCameraFailed(false);
        setStreamError(false);
        streamRetry.recover();
        setStreamSeed(current => Math.max(Date.now(), current + 1));
        setWebViewGeneration(current => current + 1);
      }, 1000);
    }
  }, [streamRetry]);

  const handleWebCameraHttpFailure = useCallback(
    (event: { nativeEvent?: { statusCode?: number } }) => {
      const statusCode = event.nativeEvent?.statusCode;
      setWebCameraErrorStatus(
        Number.isInteger(statusCode) && statusCode != null && statusCode > 0
          ? statusCode
          : null,
      );
      setWebCameraFailed(true);
    },
    [],
  );

  const resetZoom = useCallback(() => {
    scale.value = reduceMotionEnabled ? 1 : withTiming(1);
    savedScale.value = 1;
    translateX.value = reduceMotionEnabled ? 0 : withTiming(0);
    translateY.value = reduceMotionEnabled ? 0 : withTiming(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    setZoomLevel(1);
  }, [
    reduceMotionEnabled,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    scale,
    translateX,
    translateY,
  ]);

  const clearStreamTimeout = useCallback(() => {
    if (streamTimeoutRef.current == null) return;
    clearTimeout(streamTimeoutRef.current);
    streamTimeoutRef.current = null;
  }, []);

  useEffect(() => {
    if (activePrinterIdRef.current === printerId) return;
    activePrinterIdRef.current = printerId;
    iosInitialLoad.current = true;
    iosRetryCount.current = 0;
    setWebCameraErrorStatus(null);
    setWebCameraFailed(false);
    setStreamError(false);
    setStreamLoading(true);
    clearStreamTimeout();
    resetStreamRetry();
    resetZoom();
  }, [clearStreamTimeout, printerId, resetZoom, resetStreamRetry]);

  const recordStreamFailure = useCallback(() => {
    setStreamRetryCount(current => current + 1);
    retryStream();
  }, [retryStream]);

  const armStreamTimeout = useCallback(() => {
    clearStreamTimeout();
    if (Platform.OS === 'ios') {
      if (iosInitialLoad.current) {
        iosInitialLoad.current = false;
        streamTimeoutRef.current = setTimeout(() => {
          streamTimeoutRef.current = null;
          setStreamLoading(false);
          setStreamError(true);
          recordStreamFailure();
          iosRetryCount.current = 0;
          refreshStreamHealth();
          resetZoom();
        }, IOS_INITIAL_STREAM_TIMEOUT_MS);
        return;
      }
      if (iosRetryCount.current > 0) {
        streamTimeoutRef.current = setTimeout(() => {
          streamTimeoutRef.current = null;
          setStreamLoading(false);
          setStreamError(true);
          recordStreamFailure();
          refreshStreamHealth();
          resetZoom();
        }, IOS_RETRY_STREAM_TIMEOUT_MS);
        return;
      }
    }
    streamTimeoutRef.current = setTimeout(() => {
      streamTimeoutRef.current = null;
      setStreamLoading(false);
      setStreamError(true);
      recordStreamFailure();
      refreshStreamHealth();
      resetZoom();
    }, CAMERA_STREAM_TIMEOUT_MS);
  }, [clearStreamTimeout, resetZoom, refreshStreamHealth, recordStreamFailure]);

  const handleStreamLoadStart = useCallback(() => {
    setStreamLoading(true);
    setStreamError(false);
    armStreamTimeout();
  }, [armStreamTimeout]);

  const handleStreamLoadSuccess = useCallback(() => {
    clearStreamTimeout();
    setStreamLoading(false);
    recoverStream();
    recordStreamFrame();
  }, [clearStreamTimeout, recoverStream, recordStreamFrame]);

  const handleStreamLoadError = useCallback(() => {
    clearStreamTimeout();
    setStreamLoading(false);
    setStreamError(true);
    recordStreamFailure();
    refreshStreamHealth();
    resetZoom();
  }, [clearStreamTimeout, refreshStreamHealth, resetZoom, recordStreamFailure]);

  useEffect(() => clearStreamTimeout, [clearStreamTimeout]);

  useEffect(() => {
    if (Platform.OS === 'ios' && validPrinterId && webCamera && !webCameraFailed && isFocused) {
      iosInitialLoad.current = false;
      iosRetryCount.current = 0;
    }
  }, [isFocused, validPrinterId, webCamera, webCameraFailed]);

  useEffect(() => {
    clearStreamTimeout();
    setStreamError(false);
    setStreamLoading(true);
  }, [clearStreamTimeout, mediaToken, mediaTokenReady]);

  const printerQuery = useQuery({
    queryKey: ['printer', printerId],
    queryFn: () => api.getPrinter(printerId),
    enabled: validPrinterId,
  });

  const statusQuery = useQuery({
    queryKey: ['printerStatus', printerId],
    queryFn: () => api.getPrinterStatus(printerId),
    enabled: validPrinterId,
    refetchInterval: validPrinterId ? 10_000 : false,
  });

  useEffect(() => {
    if (printerQuery.data == null) return;
    setPlateDetectionEnabled(Boolean(printerQuery.data.plate_detection_enabled));
  }, [printerQuery.data]);

  const plateStatusQuery = useQuery({
    queryKey: ['plateDetectionStatus', printerId],
    queryFn: () => camerasApi.plateStatus(printerId),
    enabled: validPrinterId && plateDetectionEnabled,
    retry: false,
    refetchInterval: plateDetectionEnabled ? 15_000 : false,
  });

  const chamberLightMutation = useMutation({
    mutationFn: () => api.setChamberLight(printerId, !statusQuery.data?.chamber_light),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['printerStatus', printerId] });
      showToast(
        statusQuery.data?.chamber_light ? nativeMessage('native.b7f99a005cd8c13a') : nativeMessage('native.ddaab30a09d7974e'),
        'success',
      );
    },
    onError: error =>
      showToast(getErrorMessage(error, nativeMessage('native.f69f98dcdfcfaf2c')), 'error'),
  });

  const plateToggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      await api.updatePrinter(printerId, { plate_detection_enabled: enabled });
      return enabled;
    },
    onSuccess: async enabled => {
      setPlateDetectionEnabled(enabled);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['printer', printerId] }),
        queryClient.invalidateQueries({ queryKey: ['plateDetectionStatus', printerId] }),
      ]);
      showToast(
        enabled ? nativeMessage('native.0ae62a1de5f2fea3') : nativeMessage('native.cdcebabd7ad60a2b'),
        'success',
      );
    },
    onError: error =>
      showToast(getErrorMessage(error, nativeMessage('native.c315859611656487')), 'error'),
  });

  const refreshCamera = useCallback(async () => {
    clearStreamTimeout();
    resetStreamRetry();
    setStreamError(false);
    setStreamLoading(true);
    setWebCameraErrorStatus(null);
    setWebCameraFailed(false);
    synchronizeWebAuthToken(true);
    setStreamSeed(current => Math.max(Date.now(), current + 1));
    resetZoom();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['printer', printerId] }),
      queryClient.invalidateQueries({ queryKey: ['printerStatus', printerId] }),
      queryClient.invalidateQueries({ queryKey: ['plateDetectionStatus', printerId] }),
      queryClient.invalidateQueries({ queryKey: ['camera-stream-token'] }),
    ]);
  }, [clearStreamTimeout, printerId, queryClient, resetZoom, synchronizeWebAuthToken, resetStreamRetry]);

  const printer = printerQuery.data ?? null;

  const diagnoseMutation = useMutation({
    mutationFn: async () => {
      if (!printer?.ip_address) throw new Error(translateNative('native.ad3d1feab2c0a4e0'));
      const [connection, camera] = await Promise.allSettled([
        api.diagnoseConnection({
          ip_address: printer.ip_address,
          serial_number: printer.serial_number || undefined,
          access_code: printer.access_code || undefined,
        }),
        api.diagnosePrinterCamera(printerId),
      ]);

      const connectionError =
        connection.status === 'rejected'
          ? connection.reason instanceof Error
            ? connection.reason.message
            : translateNative('native.cc5374302e3fac12')
          : null;
      const cameraError =
        camera.status === 'rejected'
          ? camera.reason instanceof Error
            ? camera.reason.message
            : translateNative('native.9c9dce5331640d7e')
          : null;

      if (connection.status === 'rejected' && camera.status === 'rejected') {
        throw new Error(connectionError || cameraError || translateNative('native.b0635dab58a4be43'));
      }

      return {
        connection: connection.status === 'fulfilled' ? connection.value : null,
        camera: camera.status === 'fulfilled' ? camera.value : null,
        connectionError,
        cameraError,
      };
    },
    onError: error =>
      showToast(getErrorMessage(error, nativeMessage('native.631c4c50ea927873')), 'error'),
  });

  const animatedStreamStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const pinchGesture = Gesture.Pinch()
    .onBegin(() => {
      savedScale.value = scale.value;
    })
    .onUpdate(event => {
      const nextScale = Math.max(1, Math.min(MAX_CAMERA_ZOOM, savedScale.value * event.scale));
      scale.value = nextScale;
      translateX.value = clampTranslationOffset(translateX.value, containerWidth.value, nextScale);
      translateY.value = clampTranslationOffset(translateY.value, containerHeight.value, nextScale);
      runOnJS(setZoomLevel)(Number(nextScale.toFixed(1)));
    })
    .onEnd(() => {
      const nextScale = Math.max(1, Math.min(MAX_CAMERA_ZOOM, scale.value));
      const clampedX = clampTranslationOffset(translateX.value, containerWidth.value, nextScale);
      const clampedY = clampTranslationOffset(translateY.value, containerHeight.value, nextScale);
      scale.value = withTiming(nextScale);
      translateX.value = withTiming(clampedX);
      translateY.value = withTiming(clampedY);
      savedScale.value = nextScale;
      savedTranslateX.value = clampedX;
      savedTranslateY.value = clampedY;
      runOnJS(setZoomLevel)(Number(nextScale.toFixed(1)));
    });

  const panGesture = Gesture.Pan()
    .minPointers(2)
    .maxPointers(2)
    .onBegin(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate(event => {
      if (scale.value <= 1) return;
      translateX.value = clampTranslationOffset(
        savedTranslateX.value + event.translationX,
        containerWidth.value,
        scale.value,
      );
      translateY.value = clampTranslationOffset(
        savedTranslateY.value + event.translationY,
        containerHeight.value,
        scale.value,
      );
    })
    .onEnd(() => {
      const clampedX = clampTranslationOffset(translateX.value, containerWidth.value, scale.value);
      const clampedY = clampTranslationOffset(translateY.value, containerHeight.value, scale.value);
      translateX.value = withTiming(clampedX);
      translateY.value = withTiming(clampedY);
      savedTranslateX.value = clampedX;
      savedTranslateY.value = clampedY;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      scale.value = reduceMotionEnabled ? 1 : withTiming(1);
      savedScale.value = 1;
      translateX.value = reduceMotionEnabled ? 0 : withTiming(0);
      translateY.value = reduceMotionEnabled ? 0 : withTiming(0);
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
      runOnJS(setZoomLevel)(1);
    });

  const cameraGesture = Gesture.Exclusive(
    doubleTapGesture,
    Gesture.Simultaneous(pinchGesture, panGesture),
  );

  const status = statusQuery.data;
  const progress = clamp(status?.progress ?? 0);
  const printName = stripExtension(
    status?.subtask_name || status?.current_print || status?.gcode_file,
  );
  const statusLabel = getStatusLabel(status?.state, status?.stg_cur_name);
  const statusColor =
    status?.state === 'PAUSE'
      ? colors.warning
      : status?.state === 'RUNNING'
        ? colors.accent
        : status?.connected
          ? colors.success
          : colors.error;
  const streamUrl = useLocalizedMemo(() => {
    if (Platform.OS !== 'android' || !validPrinterId || !mediaTokenReady) return null;
    return withCacheBuster(
      api.getCameraStreamUrl(printerId),
      `${mediaToken ?? 'public'}-${streamSeed}`,
    );
  }, [
    mediaToken,
    mediaTokenReady,
    printerId,
    streamSeed,
    validPrinterId,
  ]);
  const cameraUnavailableReason = !validPrinterId
    ? translateNative('native.1deba92422bc0347')
    : playbackMode === 'snapshot'
      ? null
    : !status?.connected && !printer?.external_camera_enabled
      ? translateNative('native.4fdce7a50d94f6f4')
      : !status?.ipcam && !printer?.external_camera_enabled
        ? translateNative('native.3c11e78963bcd037')
        : null;

  useEffect(() => {
    if (playbackMode === 'live' && streamRetry.currentState === 'retrying' && streamRetry.retryCount > 0) {
      clearStreamTimeout();
      setStreamError(false);
      setStreamLoading(true);
      setStreamSeed(current => Math.max(Date.now(), current + 1));
      armStreamTimeout();
    }
  }, [playbackMode, streamRetry.currentState, streamRetry.retryCount, clearStreamTimeout, armStreamTimeout]);

  useEffect(() => {
    if (streamRetry.currentState === 'recovered') {
      setStreamError(false);
    }
  }, [streamRetry.currentState]);

  useEffect(() => {
    if (streamRetry.currentState === 'failed' && !streamError) {
      setStreamError(true);
    }
  }, [streamRetry.currentState, streamError]);

  useEffect(() => {
    if (playbackMode === 'live' && streamUrl && !cameraUnavailableReason && streamLoading && !streamError && streamTimeoutRef.current == null) {
      iosInitialLoad.current = false;
      iosRetryCount.current = 0;
      armStreamTimeout();
    }
  }, [playbackMode, armStreamTimeout, cameraUnavailableReason, streamError, streamLoading, streamUrl]);

  const plateRoi = printer?.plate_detection_roi ?? DEFAULT_PLATE_ROI;
  const plateStatus = plateStatusQuery.data;
  const plateStatusLabel = plateStatusQuery.isError
    ? translateNative('native.690339bc141891b7')
    : plateStatus?.calibrated
      ? translateNative('native.2f9b92b2e3f94c24')
      : translateNative('native.ba89995003347ad4');
  const plateStatusColor = plateStatus?.calibrated ? colors.success : colors.warning;

  const openActions = () => {
    setShowDiagnostic(true);
    diagnoseMutation.reset();
  };

  const runDiagnostic = () => {
    diagnoseMutation.mutate();
  };

  const toggleFitMode = () => {
    const nextFitMode = fitMode === 'cover' ? 'contain' : 'cover';
    setFitMode(nextFitMode);
    if (Platform.OS === 'ios') {
      webViewRef.current?.injectJavaScript(
        createCameraPresentationScript(nextFitMode),
      );
    }
  };

  const lightAvailable =
    status != null &&
    Object.prototype.hasOwnProperty.call(status, 'chamber_light');
  const plateAvailable =
    printer != null &&
    Object.prototype.hasOwnProperty.call(printer, 'plate_detection_enabled');
  const hasRecoveryCard =
    printerQuery.isLoading ||
    statusQuery.isLoading ||
    cameraUnavailableReason != null ||
    (Platform.OS === 'ios' &&
      (!webCamera ||
        (authEnabled && webAuthToken == null) ||
        webCameraFailed)) ||
    (Platform.OS === 'android' &&
      (streamError || !mediaTokenReady || streamUrl == null));

  const renderState = (
    title: string,
    message: string,
    actionLabel?: string,
    onAction?: () => void,
    secondaryLabel?: string,
    onSecondaryAction?: () => void,
  ) => (
    <View style={styles.stateWrap}>
      <View
        style={[
          styles.stateCard,
          { backgroundColor: colors.overlay, borderColor: colors.border },
        ]}
      >
        <AlertCircle size={24} color={colors.warning} strokeWidth={2} />
        <Text style={[styles.stateTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.stateMessage, { color: colors.textSecondary }]}> 
          {message}
        </Text>
        {actionLabel && onAction ? <PrimaryButton label={actionLabel} onPress={onAction} /> : null}
        {secondaryLabel && onSecondaryAction ? (
          <PrimaryButton label={secondaryLabel} variant="secondary" onPress={onSecondaryAction} />
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar
        hidden={shouldHideCameraStatusBar(isFocused)}
        animated={false}
        barStyle="light-content"
      />
      {printerQuery.isLoading || statusQuery.isLoading ? (
        <View style={styles.stateWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : cameraUnavailableReason ? (
        renderState(
          translateNative('native.dd79b585121476fc'),
          cameraUnavailableReason,
          validPrinterId ? 'Refresh' : undefined,
          validPrinterId ? () => void refreshCamera() : undefined,
          printer ? 'Diagnose' : undefined,
          printer ? openActions : undefined,
        )
      ) : playbackMode === 'snapshot' ? (
        <View style={styles.streamViewport}>
          <CameraSnapshot printerId={printerId} refreshSeed={streamSeed} rotation={printer?.camera_rotation} resizeMode={fitMode} active={isFocused && appState === 'active' && (!authEnabled || Boolean(user))} />
        </View>
      ) : Platform.OS === 'ios' && (!webCamera || (authEnabled && webAuthToken == null)) ? (
        renderState(
          translateNative('native.dd79b585121476fc'),
          translateNative('native.2a2bcb409fa231c3'),
          'Retry',
          () => void refreshCamera(),
        )
      ) : Platform.OS === 'ios' && webCameraFailed ? (
        renderState(
          translateNative('native.209f580062a90c3b'),
          webCameraErrorStatus == null
            ? translateNative('native.1b74f8218a94dcfe')
            : translateNative('native.c52b23a3898c6e0f', { value0: String(webCameraErrorStatus) }),
          'Retry',
          () => void refreshCamera(),
        )
      ) : Platform.OS === 'ios' && !webRendererEligible ? null
      : Platform.OS === 'ios' && webCamera ? (
        <GestureDetector gesture={cameraGesture}>
          <View
            style={styles.streamViewport}
            onLayout={event => {
              containerWidth.value = event.nativeEvent.layout.width;
              containerHeight.value = event.nativeEvent.layout.height;
            }}
          >
            <Animated.View style={[styles.streamTransform, animatedStreamStyle]}>
              <CameraWebView
                ref={webViewRef}
                key={`${printerId}:${webViewGeneration}`}
                source={{ uri: webCamera.uri }}
                style={styles.stream}
                originWhitelist={['*']}
                injectedJavaScriptBeforeContentLoaded={cameraBootstrap}
                injectedJavaScriptBeforeContentLoadedForMainFrameOnly
                javaScriptEnabled
                incognito
                sharedCookiesEnabled={false}
                useSharedProcessPool={false}
                javaScriptCanOpenWindowsAutomatically={false}
                allowFileAccessFromFileURLs={false}
                allowUniversalAccessFromFileURLs={false}
                allowsLinkPreview={false}
                onShouldStartLoadWithRequest={allowCameraNavigation}
                onOpenWindow={() => undefined}
                onFileDownload={() => undefined}
                onError={handleWebCameraFailure}
                onHttpError={handleWebCameraHttpFailure}
                onContentProcessDidTerminate={handleWebCameraFailure}
              />
            </Animated.View>
            {plateDetectionEnabled ? (
              <View pointerEvents="none" style={styles.calibrationOverlay}>
                <View
                  style={[
                    styles.calibrationFrame,
                    {
                      left: `${Math.max(0, plateRoi.x) * 100}%`,
                      top: `${Math.max(0, plateRoi.y) * 100}%`,
                      width: `${Math.min(1, plateRoi.w) * 100}%`,
                      height: `${Math.min(1, plateRoi.h) * 100}%`,
                      borderColor: plateStatus?.calibrated ? colors.success : colors.warning,
                    },
                  ]}
                >
                  {!isLandscape ? (
                    <View
                      style={[
                        styles.calibrationLabel,
                        { backgroundColor: colors.surface, borderColor: colors.border },
                      ]}
                    >
                      <Text style={[styles.calibrationLabelText, { color: colors.text }]}>
                        {translateNative('native.b2fc2583d30812da')}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>
        </GestureDetector>
      ) : !mediaTokenReady ? (
        <View style={styles.stateWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : streamError ? (
        renderState(
          translateNative('native.94b176083ff36113'),
          Platform.OS === 'ios'
            ? translateNative('native.995093ad190e5495')
            : translateNative('native.0b657e9c01f29d20'),
          'Retry',
          () => void refreshCamera(),
          'Diagnose',
          openActions,
        )
      ) : streamUrl ? (
        <GestureDetector gesture={cameraGesture}>
          <View
            style={styles.streamViewport}
            onLayout={event => {
              containerWidth.value = event.nativeEvent.layout.width;
              containerHeight.value = event.nativeEvent.layout.height;
            }}
          >
            <Animated.View style={[styles.streamTransform, animatedStreamStyle]}>
              <Image
                testID="camera-stream-image"
                source={{ uri: streamUrl }}
                style={styles.stream}
                resizeMode={fitMode}
                onLoadStart={handleStreamLoadStart}
                onLoad={handleStreamLoadSuccess}
                onError={handleStreamLoadError}
              />
            </Animated.View>
            <StreamStatusIndicator
              retryState={streamRetry.currentState}
              healthStatus={streamHealth.status}
              retryCount={streamRetry.retryCount}
              maxRetries={streamRetry.maxRetries}
              refreshCount={streamRetryCount}
              colors={colors}
            />
            {plateDetectionEnabled ? (
              <View pointerEvents="none" style={styles.calibrationOverlay}>
                <View
                  style={[
                    styles.calibrationFrame,
                    {
                      left: `${Math.max(0, plateRoi.x) * 100}%`,
                      top: `${Math.max(0, plateRoi.y) * 100}%`,
                      width: `${Math.min(1, plateRoi.w) * 100}%`,
                      height: `${Math.min(1, plateRoi.h) * 100}%`,
                      borderColor: plateStatus?.calibrated ? colors.success : colors.warning,
                    },
                  ]}
                >
                  {!isLandscape ? (
                    <View
                      style={[
                        styles.calibrationLabel,
                        { backgroundColor: colors.surface, borderColor: colors.border },
                      ]}
                    >
                      <Text style={[styles.calibrationLabelText, { color: colors.text }]}>
                        {translateNative('native.b2fc2583d30812da')}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}
            {streamLoading ? (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={colors.accent} />
                {streamRetry.currentState === 'retrying' ? (
                  <Text style={[styles.loadingLabel, { color: colors.text }]}><NativeTranslation id="native.26aa1d3f369a5f7d" values={{ value0: (streamRetry.retryCount), value1: (streamRetry.maxRetries) }} /></Text>
                ) : (
                  <Text style={[styles.loadingLabel, { color: colors.text }]}>{translateNative('native.7e74de81fc525b25')}</Text>
                )}
              </View>
            ) : null}
          </View>
        </GestureDetector>
      ) : null}

      <View
        testID="camera-header-overlay"
        style={[
          isLandscape ? styles.landscapeHeader : styles.portraitHeader,
          {
            top: insets.top + spacing.sm,
            left: insets.left + spacing.md,
          },
          !isLandscape && { right: insets.right + spacing.md },
        ]}
      >
        <CameraIconButton
          label={translateNative('native.0e30986ccd0fc31b')}
          hint={translateNative('native.5c3d7d480cb86594')}
          onPress={() => navigation.goBack()}
          icon={<X size={20} color={colors.text} strokeWidth={2} />}
          style={{ backgroundColor: colors.surface, borderColor: colors.border }}
        />
        {!isLandscape ? (
          <View accessible accessibilityLabel={translateNative('native.9253545102ea9094', { value0: String(printer?.name || 'Camera') })} style={styles.headerTitle}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {printer?.name || translateNative('native.ac1081d67c0eb4a3')}
            </Text>
            <Text style={[styles.headerContext, { color: colors.textSecondary }]} numberOfLines={1}>
              {translateNative('native.ac1081d67c0eb4a3')}</Text>
          </View>
        ) : null}
        {!isLandscape ? (
          <CameraIconButton
            label={translateNative('native.53d12fa7328580d5')}
            hint={translateNative('native.66d49695f1827c1c')}
            onPress={openActions}
            icon={<MoreHorizontal size={20} color={colors.text} strokeWidth={2} />}
            style={{ backgroundColor: colors.surface, borderColor: colors.border }}
          />
        ) : null}
      </View>

      {isLandscape ? (
        <View
          testID="camera-landscape-control-rail"
          accessibilityLabel={translateNative('native.c7843bd0bc7a8510')}
          pointerEvents="box-none"
          style={[
            styles.landscapeRail,
            {
              top: insets.top + spacing.sm,
              right: insets.right + spacing.md,
              bottom: insets.bottom + spacing.sm,
            },
          ]}
        >
          <View
            testID="camera-landscape-control-rail-surface"
            style={[
              styles.landscapeRailSurface,
              {
                backgroundColor: colors.overlay,
                borderColor: colors.border,
                shadowColor: colors.text,
              },
            ]}
          >
            <CameraIconButton
              label={translateNative('native.40d21d5ae404c92c')}
              hint={translateNative('native.be4298183744e118')}
              onPress={() => void refreshCamera()}
              icon={<RefreshCw size={19} color={colors.text} strokeWidth={2} />}
              style={{ backgroundColor: colors.surface, borderColor: colors.border }}
            />
            {lightAvailable ? (
              <CameraIconButton
                label={status?.chamber_light ? translateNative('native.7544ec907e0c0064') : translateNative('native.04e24f94c8b265e4')}
                hint={translateNative('native.fac307648000086e')}
                onPress={() => chamberLightMutation.mutate()}
                disabled={!hasPermission('printers:control') || chamberLightMutation.isPending}
                selected={Boolean(status?.chamber_light)}
                busy={chamberLightMutation.isPending}
                icon={<Lightbulb size={19} color={status?.chamber_light ? colors.warning : colors.text} strokeWidth={2} />}
                style={{
                  backgroundColor: status?.chamber_light ? colors.accentBg : colors.surface,
                  borderColor: status?.chamber_light ? colors.warning : colors.border,
                }}
              />
            ) : null}
            <CameraIconButton
              label={fitMode === 'cover' ? translateNative('native.52c2c970ff0f663d') : translateNative('native.c466b1f457dd9e2f')}
              hint={translateNative('native.db64ce1d267e4e27')}
              onPress={toggleFitMode}
              selected={fitMode === 'contain'}
              icon={fitMode === 'cover'
                ? <Minimize size={19} color={colors.text} strokeWidth={2} />
                : <Maximize size={19} color={colors.text} strokeWidth={2} />}
              style={{ backgroundColor: colors.surface, borderColor: colors.border }}
            />
            <CameraIconButton
              label={translateNative('native.53d12fa7328580d5')}
              hint={translateNative('native.66d49695f1827c1c')}
              onPress={openActions}
              icon={<MoreHorizontal size={20} color={colors.text} strokeWidth={2} />}
              style={{ backgroundColor: colors.surface, borderColor: colors.border }}
            />
          </View>
        </View>
      ) : null}

      {!isLandscape ? (
        <View
          testID="camera-bottom-overlay"
          style={[
            styles.bottomStack,
            {
              bottom: insets.bottom + spacing.md,
              left: insets.left + spacing.md,
              right: insets.right + spacing.md,
            },
          ]}
        >
          {zoomLevel > 1 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={translateNative('native.6e665e1a79082b83')}
              accessibilityHint={translateNative('native.606488b57cb4b269')}
              onPress={resetZoom}
              style={[styles.zoomBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Text style={[styles.zoomBadgeText, { color: colors.text }]}><NativeTranslation id="native.a5e2122e6ed733c0" values={{ value0: (zoomLevel.toFixed(1)) }} /></Text>
            </Pressable>
          ) : null}
          <View
            accessibilityLabel={translateNative('native.c7843bd0bc7a8510')}
            style={[styles.cameraDock, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <CameraIconButton
              label={translateNative('native.40d21d5ae404c92c')}
              hint={translateNative('native.be4298183744e118')}
              onPress={() => void refreshCamera()}
              icon={<RefreshCw size={19} color={colors.text} strokeWidth={2} />}
            />
            {lightAvailable ? (
              <CameraIconButton
                label={status?.chamber_light ? translateNative('native.7544ec907e0c0064') : translateNative('native.04e24f94c8b265e4')}
                hint={translateNative('native.fac307648000086e')}
                onPress={() => chamberLightMutation.mutate()}
                disabled={!hasPermission('printers:control') || chamberLightMutation.isPending}
                selected={Boolean(status?.chamber_light)}
                busy={chamberLightMutation.isPending}
                icon={<Lightbulb size={19} color={status?.chamber_light ? colors.warning : colors.text} strokeWidth={2} />}
                style={{
                  backgroundColor: status?.chamber_light ? colors.accentBg : colors.surface,
                  borderColor: status?.chamber_light ? colors.warning : colors.border,
                }}
              />
            ) : null}
            {plateAvailable ? (
              <CameraIconButton
                label={plateDetectionEnabled ? translateNative('native.32c1890bcaa41a4a') : translateNative('native.057463ce7bc12d2d')}
                hint={translateNative('native.bcb575a73854cc64')}
                onPress={() => void plateToggleMutation.mutateAsync(!plateDetectionEnabled)}
                disabled={plateToggleMutation.isPending || !validPrinterId}
                selected={plateDetectionEnabled}
                busy={plateToggleMutation.isPending}
                icon={<Layers size={19} color={plateDetectionEnabled ? colors.accent : colors.text} strokeWidth={2} />}
                style={{
                  backgroundColor: plateDetectionEnabled ? colors.accentBg : colors.surface,
                  borderColor: plateDetectionEnabled ? colors.accent : colors.border,
                }}
              />
            ) : null}
            <CameraIconButton
              label={fitMode === 'cover' ? translateNative('native.52c2c970ff0f663d') : translateNative('native.c466b1f457dd9e2f')}
              hint={translateNative('native.db64ce1d267e4e27')}
              onPress={toggleFitMode}
              selected={fitMode === 'contain'}
              icon={fitMode === 'cover'
                ? <Minimize size={19} color={colors.text} strokeWidth={2} />
                : <Maximize size={19} color={colors.text} strokeWidth={2} />}
            />
          </View>
          {!hasRecoveryCard ? (
            <View
              style={[
                styles.overlayCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.overlayHeader}>
                <Text style={[styles.subtitle, { color: colors.text }]} numberOfLines={1}>
                  {printName}
                </Text>
                <StatusBadge label={statusLabel} color={statusColor} />
              </View>
              <View style={[styles.progressTrack, { backgroundColor: colors.surfaceHover }]}>
                <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: statusColor }]} />
              </View>
              <View style={styles.statsRow}>
                <Text style={[styles.stat, { color: colors.text }]}>{Math.round(progress)}%</Text>
                <Text style={[styles.stat, { color: colors.textSecondary }]}>
                  {status?.layer_num != null && status?.total_layers != null
                    ? translateNative('native.dbe76f0367322d5b', { value0: String(status.layer_num), value1: String(status.total_layers) })
                    : status?.state || translateNative('native.a3b81f922d798281')}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      <DiagnosticSheet
        visible={showDiagnostic}
        onClose={() => setShowDiagnostic(false)}
        onRetry={runDiagnostic}
        pending={diagnoseMutation.isPending}
        result={diagnoseMutation.data ?? null}
        printer={printer}
        reduceMotionEnabled={reduceMotionEnabled}
      >
        <PrimaryButton label={t('camera.skipObjects', { defaultValue: 'Skip objects' })}
          disabled={!hasPermission('printers:control') || !['RUNNING', 'PAUSE'].includes(status?.state ?? '')}
          onPress={() => { setShowDiagnostic(false); setShowSkipObjects(true); }} />
        <PrimaryButton label={playbackMode === 'live'
          ? t('camera.switchSnapshot', { defaultValue: 'Switch to snapshot mode' })
          : t('camera.switchLive', { defaultValue: 'Switch to live stream' })}
          onPress={() => {
            clearStreamTimeout();
            resetStreamRetry();
            setPlaybackMode(current => current === 'live' ? 'snapshot' : 'live');
            setStreamLoading(true);
            setStreamError(false);
            setShowDiagnostic(false);
          }} />
        <PrimaryButton label={playbackMode === 'snapshot'
          ? t('camera.refreshSnapshot', { defaultValue: 'Refresh snapshot' })
          : t('camera.refreshLive', { defaultValue: 'Restart live stream' })}
          onPress={() => void refreshCamera()} />
        {printer && plateAvailable ? <PlateManagement printer={printer} /> : null}
        {plateAvailable ? (
          <View
            style={[
              styles.plateDetectionPanel,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
            ]}
          >
            <View style={styles.plateDetectionHeader}>
              <View style={styles.overlayText}>
                <Text style={[styles.plateDetectionTitle, { color: colors.text }]}>{translateNative('native.b2e8670958009a4c')}</Text>
                <Text style={[styles.plateDetectionMessage, { color: colors.textSecondary }]}> 
                  {plateStatusQuery.isError
                    ? translateNative('native.af01581627deee4a')
                    : plateStatus?.message || translateNative('native.48ebf89b4e191729')}
                </Text>
              </View>
              <StatusBadge label={plateStatusLabel} color={plateStatusColor} />
            </View>
            <PrimaryButton
              label={plateDetectionEnabled ? translateNative('native.32c1890bcaa41a4a') : translateNative('native.057463ce7bc12d2d')}
              variant="secondary"
              onPress={() => void plateToggleMutation.mutateAsync(!plateDetectionEnabled)}
              disabled={plateToggleMutation.isPending || !validPrinterId}
            />
            <View style={styles.plateStatsRow}>
              <Text style={[styles.plateMeta, { color: colors.textSecondary }]}> 
                {translateNative('native.1f976b05e0b24708')}</Text>
              <Text style={[styles.plateMeta, { color: colors.text }]}> 
                {plateStatus?.reference_count ?? 0}/{plateStatus?.max_references ?? 0}
              </Text>
            </View>
          </View>
        ) : null}
      </DiagnosticSheet>
      {showSkipObjects ? <SkipObjectsModal visible printerId={printerId} onClose={() => setShowSkipObjects(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  streamViewport: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
  },
  streamTransform: {
    flex: 1,
  },
  stream: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  calibrationOverlay: {
    ...StyleSheet.absoluteFill,
  },
  calibrationFrame: {
    position: 'absolute',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: borderRadius.xl,
  },
  calibrationLabel: {
    position: 'absolute',
    top: -16,
    left: spacing.sm,
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  calibrationLabelText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  portraitHeader: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  landscapeHeader: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  headerContext: {
    fontSize: fontSize.xs,
  },
  landscapeRail: {
    position: 'absolute',
    justifyContent: 'center',
  },
  landscapeRailSurface: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
    gap: spacing.sm,
    padding: spacing.xs,
    borderWidth: 1,
    borderRadius: borderRadius.full,
    elevation: 8,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.24,
    shadowRadius: 6,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBadge: {
    minHeight: 44,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
  },
  zoomBadgeText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  bottomStack: {
    position: 'absolute',
    gap: spacing.sm,
  },
  cameraDock: {
    minHeight: 52,
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: borderRadius.full,
    padding: spacing.xs,
  },
  overlayCard: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  overlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  overlayText: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    fontSize: fontSize.sm,
  },
  progressTrack: {
    height: 8,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  stat: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  plateDetectionPanel: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    gap: spacing.sm,
  },
  plateDetectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  plateDetectionTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  plateDetectionMessage: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  plateStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  plateMeta: {
    fontSize: fontSize.sm,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  streamStatusBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  streamStatusIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  streamStatusText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  stateCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    padding: spacing.xl,
    gap: spacing.md,
    alignItems: 'center',
  },
  stateTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
  },
  stateMessage: {
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderWidth: 1,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    maxHeight: '90%',
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  modalHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  modalSubtitle: {
    fontSize: fontSize.sm,
  },
  modalBody: {
    gap: spacing.md,
  },
  loadingState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  modalHint: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  diagSection: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    gap: spacing.sm,
  },
  diagSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  diagTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  diagRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  diagRowText: {
    flex: 1,
    gap: 2,
  },
  diagRowTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  diagRowBody: {
    fontSize: fontSize.xs,
    lineHeight: 18,
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  errorTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  errorMessage: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
});
