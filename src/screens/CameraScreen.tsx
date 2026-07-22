import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
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
  RefreshCw,
  Stethoscope,
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
import { api, ApiError } from '@/api/client';
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

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function stripExtension(name: string | null | undefined) {
  if (!name) return 'No active print';
  return name.replace(/\.(gcode|3mf)$/i, '');
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function getStatusLabel(state: string | null | undefined, stage: string | null | undefined) {
  if (stage) return stage;
  if (!state) return 'Unknown';
  return state.charAt(0) + state.slice(1).toLowerCase();
}

function ConnectionCheckIcon({ status, colors }: { status: DiagnosticStatus; colors: ReturnType<typeof useTheme>['colors'] }) {
  if (status === 'pass') return <CheckCircle2 size={16} color={colors.success} strokeWidth={2} />;
  if (status === 'fail') return <XCircle size={16} color={colors.error} strokeWidth={2} />;
  if (status === 'warn') return <AlertTriangle size={16} color={colors.warning} strokeWidth={2} />;
  return <MinusCircle size={16} color={colors.textTertiary} strokeWidth={2} />;
}

function CameraStageIcon({ status, colors }: { status: CameraDiagnoseResult['stages'][number]['status']; colors: ReturnType<typeof useTheme>['colors'] }) {
  if (status === 'ok') return <CheckCircle2 size={16} color={colors.success} strokeWidth={2} />;
  if (status === 'failed') return <XCircle size={16} color={colors.error} strokeWidth={2} />;
  return <MinusCircle size={16} color={colors.textTertiary} strokeWidth={2} />;
}

function checkTitle(check: DiagnosticCheck) {
  switch (check.id) {
    case 'port_mqtt':
      return 'MQTT port';
    case 'port_ftps':
      return 'FTPS port';
    case 'port_rtsps':
      return 'RTSPS camera port';
    case 'network_mode':
      return 'Network mode';
    case 'subnet':
      return 'Subnet routing';
    case 'mqtt_auth':
      return 'MQTT authentication';
    case 'developer_mode':
      return 'Developer mode';
    default:
      return String(check.id).replace(/_/g, ' ');
  }
}

function stageTitle(name: CameraDiagnoseResult['stages'][number]['name']) {
  switch (name) {
    case 'tcp_reachable':
      return 'TCP connection to camera';
    case 'first_frame':
      return 'First camera frame';
    case 'live_stream_active':
      return 'Live stream availability';
    default:
      return String(name).replace(/_/g, ' ');
  }
}

function overallSummary(result: PrinterDiagnosticResult) {
  if (result.overall === 'ok') return 'Camera connectivity checks passed.';
  if (result.overall === 'warnings') return 'Camera connectivity is reachable, but one or more checks need attention.';
  return 'Camera connectivity problems were detected.';
}

function cameraSummary(result: CameraDiagnoseResult) {
  if (result.overall_status === 'ok') return 'Camera stream checks passed.';
  switch (result.summary_code) {
    case 'stream_unreachable':
      return 'The camera port could not be reached.';
    case 'first_frame_timeout':
      return 'The camera responded, but the first frame never arrived.';
    case 'live_stream_inactive':
      return 'The stream starts but does not stay active.';
    default:
      return 'The camera diagnostic found a stream problem.';
  }
}

function DiagnosticSheet({
  visible,
  onClose,
  onRetry,
  pending,
  result,
  printer,
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
}) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}> 
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.modalCard, { backgroundColor: colors.modalBg, borderColor: colors.border }]}> 
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderText}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Camera diagnostic</Text>
              <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                {printer?.name || 'Printer camera'}
              </Text>
            </View>
            <Pressable onPress={onClose}>
              <X size={18} color={colors.textSecondary} strokeWidth={2} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody}>
            {pending ? (
              <View style={styles.loadingState}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={[styles.modalHint, { color: colors.textSecondary }]}>Checking camera ports, routing, and stream health…</Text>
              </View>
            ) : null}

            {result?.connection ? (
              <View style={[styles.diagSection, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
                <View style={styles.diagSectionHeader}>
                  <Text style={[styles.diagTitle, { color: colors.text }]}>Connection checks</Text>
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
                <Text style={[styles.errorTitle, { color: colors.error }]}>Connection diagnostic failed</Text>
                <Text style={[styles.errorMessage, { color: colors.textSecondary }]}>{result.connectionError}</Text>
              </View>
            ) : null}

            {result?.camera ? (
              <View style={[styles.diagSection, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
                <View style={styles.diagSectionHeader}>
                  <Text style={[styles.diagTitle, { color: colors.text }]}>Camera stream checks</Text>
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
                      <Text style={[styles.diagRowBody, { color: colors.textSecondary }]}>
                        {stage.duration_ms} ms{stage.code ? ` · ${stage.code}` : ''}
                      </Text>
                    </View>
                  </View>
                ))}
                <Text style={[styles.modalHint, { color: colors.textSecondary }]}>Protocol: {result.camera.protocol} · Port: {result.camera.port} · Profile: {result.camera.profile}</Text>
              </View>
            ) : null}

            {result?.cameraError ? (
              <View style={[styles.errorBox, { backgroundColor: `${colors.warning}15`, borderColor: `${colors.warning}40` }]}> 
                <Text style={[styles.errorTitle, { color: colors.warning }]}>Camera stream diagnostic failed</Text>
                <Text style={[styles.errorMessage, { color: colors.textSecondary }]}>{result.cameraError}</Text>
              </View>
            ) : null}

            {!pending && !result?.connection && !result?.camera && !result?.connectionError && !result?.cameraError ? (
              <Text style={[styles.modalHint, { color: colors.textSecondary }]}>No diagnostic results are available yet.</Text>
            ) : null}
          </ScrollView>

          <View style={styles.modalActions}>
            <PrimaryButton label={pending ? 'Checking…' : 'Retry'} variant="secondary" onPress={onRetry} disabled={pending} />
            <PrimaryButton label="Close" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const MAX_CAMERA_ZOOM = 4;
const DEFAULT_PLATE_ROI: PlateDetectionROI = {
  x: 0.18,
  y: 0.2,
  w: 0.64,
  h: 0.44,
};

function clampTranslationOffset(value: number, axisSize: number, scale: number) {
  'worklet';
  const maxOffset = Math.max(0, ((axisSize * scale) - axisSize) / 2);
  return Math.max(-maxOffset, Math.min(maxOffset, value));
}

export default function CameraScreen() {
  const navigation = useNavigation<RootNavigationProp<'Camera'>>();
  const route = useRoute<RootRouteProp<'Camera'>>();
  const { colors } = useTheme();
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [fullscreen, setFullscreen] = useState(false);
  const [streamSeed, setStreamSeed] = useState(() => Date.now());
  const [streamLoading, setStreamLoading] = useState(true);
  const [streamError, setStreamError] = useState(false);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [plateDetectionEnabled, setPlateDetectionEnabled] = useState(false);
  const [plateSensitivity, setPlateSensitivity] = useState<'low' | 'medium' | 'high'>('medium');

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const containerWidth = useSharedValue(0);
  const containerHeight = useSharedValue(0);

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Camera', headerShown: false });
  }, [navigation]);

  const { id } = (route.params ?? {}) as { id?: string | number };
  const printerId = Number(id);
  const validPrinterId = Number.isFinite(printerId) && printerId > 0;

  const resetZoom = useCallback(() => {
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    setZoomLevel(1);
  }, [savedScale, savedTranslateX, savedTranslateY, scale, translateX, translateY]);

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
    queryFn: () => api.getPlateDetectionStatus(printerId),
    enabled: validPrinterId && plateDetectionEnabled,
    retry: false,
    refetchInterval: plateDetectionEnabled ? 15_000 : false,
  });

  const chamberLightMutation = useMutation({
    mutationFn: () => api.setChamberLight(printerId, !statusQuery.data?.chamber_light),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['printerStatus', printerId] });
      showToast(
        statusQuery.data?.chamber_light ? 'Chamber light turned off.' : 'Chamber light turned on.',
        'success',
      );
    },
    onError: error =>
      showToast(getErrorMessage(error, 'Unable to update chamber light.'), 'error'),
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
        enabled ? 'Plate detection enabled.' : 'Plate detection disabled.',
        'success',
      );
    },
    onError: error =>
      showToast(getErrorMessage(error, 'Unable to update plate detection.'), 'error'),
  });

  const calibratePlateMutation = useMutation({
    mutationFn: () =>
      api.calibratePlateDetection(printerId, {
        sensitivity: plateSensitivity,
      }),
    onSuccess: async result => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['plateDetectionStatus', printerId] }),
        queryClient.invalidateQueries({ queryKey: ['printer', printerId] }),
      ]);
      showToast(result.message || 'Plate detection calibration started.', 'success');
    },
    onError: error =>
      showToast(
        getErrorMessage(error, 'Unable to calibrate plate detection.'),
        'error',
      ),
  });

  const refreshCamera = useCallback(async () => {
    setStreamError(false);
    setStreamLoading(true);
    setStreamSeed(Date.now());
    resetZoom();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['printer', printerId] }),
      queryClient.invalidateQueries({ queryKey: ['printerStatus', printerId] }),
      queryClient.invalidateQueries({ queryKey: ['plateDetectionStatus', printerId] }),
    ]);
  }, [printerId, queryClient, resetZoom]);

  const printer = printerQuery.data ?? null;

  const diagnoseMutation = useMutation({
    mutationFn: async () => {
      if (!printer?.ip_address) throw new Error('Printer IP address is unavailable.');
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
            : 'Unable to run the connection diagnostic.'
          : null;
      const cameraError =
        camera.status === 'rejected'
          ? camera.reason instanceof Error
            ? camera.reason.message
            : 'Unable to run the camera stream diagnostic.'
          : null;

      if (connection.status === 'rejected' && camera.status === 'rejected') {
        throw new Error(connectionError || cameraError || 'Unable to run camera diagnostics.');
      }

      return {
        connection: connection.status === 'fulfilled' ? connection.value : null,
        camera: camera.status === 'fulfilled' ? camera.value : null,
        connectionError,
        cameraError,
      };
    },
    onError: error =>
      showToast(getErrorMessage(error, 'Unable to run the camera diagnostic.'), 'error'),
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
      scale.value = withTiming(1);
      savedScale.value = 1;
      translateX.value = withTiming(0);
      translateY.value = withTiming(0);
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
  const streamUrl = useMemo(() => {
    if (!validPrinterId) return null;
    return withCacheBuster(api.getCameraStreamUrl(printerId), streamSeed);
  }, [printerId, streamSeed, validPrinterId]);
  const cameraUnavailableReason = !validPrinterId
    ? 'Missing printer id.'
    : !status?.connected
      ? 'Printer is offline.'
      : !status?.ipcam
        ? 'Camera is unavailable for this printer.'
        : null;

  const plateRoi = printer?.plate_detection_roi ?? DEFAULT_PLATE_ROI;
  const plateStatus = plateStatusQuery.data;
  const plateStatusLabel = plateStatusQuery.isError
    ? 'Unavailable'
    : plateStatus?.calibrated
      ? 'Calibrated'
      : 'Needs calibration';
  const plateStatusColor = plateStatus?.calibrated ? colors.success : colors.warning;

  const openDiagnostic = () => {
    setShowDiagnostic(true);
    diagnoseMutation.reset();
    diagnoseMutation.mutate();
  };

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
    <View style={[styles.container, { backgroundColor: '#000' }]}> 
      {printerQuery.isLoading || statusQuery.isLoading ? (
        <View style={styles.stateWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : cameraUnavailableReason ? (
        renderState(
          'Camera unavailable',
          cameraUnavailableReason,
          validPrinterId ? 'Refresh' : undefined,
          validPrinterId ? () => void refreshCamera() : undefined,
          printer ? 'Diagnose' : undefined,
          printer ? openDiagnostic : undefined,
        )
      ) : streamError ? (
        renderState(
          'Unable to load stream',
          'The live camera stream failed to start.',
          'Retry stream',
          () => void refreshCamera(),
          'Diagnose',
          openDiagnostic,
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
                source={{ uri: streamUrl }}
                style={styles.stream}
                resizeMode={fullscreen ? 'cover' : 'contain'}
                onLoadStart={() => {
                  setStreamLoading(true);
                  setStreamError(false);
                }}
                onLoad={() => setStreamLoading(false)}
                onError={() => {
                  setStreamLoading(false);
                  setStreamError(true);
                  resetZoom();
                }}
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
                  <View
                    style={[
                      styles.calibrationLabel,
                      { backgroundColor: colors.overlay, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.calibrationLabelText, { color: colors.text }]}> 
                      Plate detection area
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}
            {streamLoading ? (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={colors.accent} />
                <Text style={[styles.loadingLabel, { color: colors.text }]}>Connecting to live stream…</Text>
              </View>
            ) : null}
          </View>
        </GestureDetector>
      ) : null}

      <View style={[styles.topBar, { top: insets.top + spacing.md }]}> 
        <Pressable
          onPress={() => navigation.goBack()}
          style={[
            styles.iconButton,
            { backgroundColor: colors.overlay, borderColor: colors.border },
          ]}
        >
          <X size={20} color={colors.text} strokeWidth={2} />
        </Pressable>

        <View style={styles.topActions}>
          <Pressable
            onPress={() => void refreshCamera()}
            style={[
              styles.toolbarButton,
              { backgroundColor: colors.overlay, borderColor: colors.border },
            ]}
          >
            <RefreshCw size={16} color={colors.text} strokeWidth={2} />
            {!fullscreen ? <Text style={[styles.toolbarText, { color: colors.text }]}>Refresh</Text> : null}
          </Pressable>

          <Pressable
            onPress={openDiagnostic}
            disabled={!printer || diagnoseMutation.isPending}
            style={[
              styles.toolbarButton,
              { backgroundColor: colors.overlay, borderColor: colors.border },
              (!printer || diagnoseMutation.isPending) && styles.disabledButton,
            ]}
          >
            <Stethoscope size={16} color={colors.text} strokeWidth={2} />
            {!fullscreen ? <Text style={[styles.toolbarText, { color: colors.text }]}>Diagnose</Text> : null}
          </Pressable>

          <Pressable
            onPress={() => void plateToggleMutation.mutateAsync(!plateDetectionEnabled)}
            disabled={plateToggleMutation.isPending || !validPrinterId}
            style={[
              styles.toolbarButton,
              {
                backgroundColor: plateDetectionEnabled ? `${colors.info}25` : colors.overlay,
                borderColor: plateDetectionEnabled ? colors.info : colors.border,
              },
              (plateToggleMutation.isPending || !validPrinterId) && styles.disabledButton,
            ]}
          >
            <Layers
              size={16}
              color={plateDetectionEnabled ? colors.info : colors.text}
              strokeWidth={2}
            />
            {!fullscreen ? (
              <Text
                style={[
                  styles.toolbarText,
                  { color: plateDetectionEnabled ? colors.info : colors.text },
                ]}
              >
                Plate detection
              </Text>
            ) : null}
          </Pressable>

          <Pressable
            onPress={() => chamberLightMutation.mutate()}
            disabled={!hasPermission('printers:control') || chamberLightMutation.isPending}
            style={[
              styles.toolbarButton,
              {
                backgroundColor: status?.chamber_light ? `${colors.warning}33` : colors.overlay,
                borderColor: status?.chamber_light ? colors.warning : colors.border,
              },
              (!hasPermission('printers:control') || chamberLightMutation.isPending) &&
                styles.disabledButton,
            ]}
          >
            <Lightbulb
              size={16}
              color={status?.chamber_light ? colors.warning : colors.text}
              strokeWidth={2}
            />
            {!fullscreen ? (
              <Text
                style={[
                  styles.toolbarText,
                  { color: status?.chamber_light ? colors.warning : colors.text },
                ]}
              >
                {status?.chamber_light ? 'Light on' : 'Light off'}
              </Text>
            ) : null}
          </Pressable>

          <Pressable
            onPress={() => {
              setFullscreen(current => !current);
              resetZoom();
            }}
            style={[
              styles.toolbarButton,
              { backgroundColor: colors.overlay, borderColor: colors.border },
            ]}
          >
            {fullscreen ? (
              <Minimize size={16} color={colors.text} strokeWidth={2} />
            ) : (
              <Maximize size={16} color={colors.text} strokeWidth={2} />
            )}
            {!fullscreen ? (
              <Text style={[styles.toolbarText, { color: colors.text }]}>
                {fullscreen ? 'Fit' : 'Fill'}
              </Text>
            ) : null}
          </Pressable>
        </View>
      </View>

      <View
        style={[
          styles.zoomBadge,
          {
            top: insets.top + 68,
            backgroundColor: colors.overlay,
            borderColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.zoomBadgeText, { color: colors.text }]}> 
          {zoomLevel.toFixed(1)}×
        </Text>
        {zoomLevel > 1 ? (
          <Text style={[styles.zoomHint, { color: colors.textSecondary }]}>Double-tap to reset</Text>
        ) : null}
      </View>

      <View
        style={[
          styles.overlayCard,
          {
            backgroundColor: colors.overlay,
            borderColor: colors.border,
            bottom: insets.bottom + spacing.lg,
          },
          fullscreen && styles.overlayCardFullscreen,
        ]}
      >
        <View style={styles.overlayHeader}>
          <View style={styles.overlayText}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {printer?.name || 'Camera'}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {printName}
            </Text>
          </View>
          <StatusBadge label={statusLabel} color={statusColor} />
        </View>

        <View style={[styles.progressTrack, { backgroundColor: colors.surfaceHover }]}> 
          <View
            style={[
              styles.progressFill,
              { width: `${progress}%`, backgroundColor: statusColor },
            ]}
          />
        </View>

        <View style={styles.statsRow}>
          <Text style={[styles.stat, { color: colors.text }]}>{Math.round(progress)}%</Text>
          <Text style={[styles.stat, { color: colors.textSecondary }]}> 
            {status?.layer_num != null && status?.total_layers != null
              ? `Layer ${status.layer_num}/${status.total_layers}`
              : status?.state || 'Idle'}
          </Text>
        </View>

        {plateDetectionEnabled ? (
          <View
            style={[
              styles.plateDetectionPanel,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
            ]}
          >
            <View style={styles.plateDetectionHeader}>
              <View style={styles.overlayText}>
                <Text style={[styles.plateDetectionTitle, { color: colors.text }]}>Plate detection</Text>
                <Text style={[styles.plateDetectionMessage, { color: colors.textSecondary }]}> 
                  {plateStatusQuery.isError
                    ? 'Status is unavailable. You can still retry calibration.'
                    : plateStatus?.message || 'Use calibration after clearing the build plate.'}
                </Text>
              </View>
              <StatusBadge label={plateStatusLabel} color={plateStatusColor} />
            </View>
            <View style={styles.plateStatsRow}>
              <Text style={[styles.plateMeta, { color: colors.textSecondary }]}> 
                Sensitivity
              </Text>
              <View style={styles.sensitivityRow}>
                {(['low', 'medium', 'high'] as const).map(level => {
                  const active = plateSensitivity === level;
                  return (
                    <Pressable
                      key={level}
                      onPress={() => setPlateSensitivity(level)}
                      style={[
                        styles.sensitivityChip,
                        {
                          backgroundColor: active ? colors.accentBg : colors.surfaceHover,
                          borderColor: active ? colors.accent : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.sensitivityChipText,
                          { color: active ? colors.accentLight : colors.textSecondary },
                        ]}
                      >
                        {level.charAt(0).toUpperCase() + level.slice(1)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={styles.plateStatsRow}>
              <Text style={[styles.plateMeta, { color: colors.textSecondary }]}> 
                References
              </Text>
              <Text style={[styles.plateMeta, { color: colors.text }]}> 
                {plateStatus?.reference_count ?? 0}/{plateStatus?.max_references ?? 0}
              </Text>
            </View>
            <PrimaryButton
              label={calibratePlateMutation.isPending ? 'Calibrating…' : 'Calibrate overlay'}
              variant="secondary"
              onPress={() => void calibratePlateMutation.mutateAsync()}
              loading={calibratePlateMutation.isPending}
            />
          </View>
        ) : null}
      </View>

      <DiagnosticSheet
        visible={showDiagnostic}
        onClose={() => setShowDiagnostic(false)}
        onRetry={() => diagnoseMutation.mutate()}
        pending={diagnoseMutation.isPending}
        result={diagnoseMutation.data ?? null}
        printer={printer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  streamViewport: {
    flex: 1,
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
  topBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  topActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    flex: 1,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarButton: {
    minHeight: 44,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  toolbarText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  zoomBadge: {
    position: 'absolute',
    left: spacing.lg,
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  zoomBadgeText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  zoomHint: {
    fontSize: fontSize.xs,
  },
  overlayCard: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  overlayCardFullscreen: {
    left: spacing.lg,
    right: spacing.lg,
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
    fontSize: fontSize.xl,
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
  sensitivityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    flex: 1,
  },
  sensitivityChip: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sensitivityChipText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
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
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    maxHeight: '85%',
    gap: spacing.md,
    padding: spacing.lg,
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
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
});
