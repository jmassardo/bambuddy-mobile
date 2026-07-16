import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Lightbulb, Maximize, Minimize, RefreshCw, X } from 'lucide-react-native';
import { api, ApiError } from '@/api/client';
import { PrimaryButton, StatusBadge } from '@/components/common/AppUI';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';
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

export default function CameraScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors } = useTheme();
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [fullscreen, setFullscreen] = useState(false);
  const [streamSeed, setStreamSeed] = useState(() => Date.now());
  const [streamLoading, setStreamLoading] = useState(true);
  const [streamError, setStreamError] = useState(false);

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Camera', headerShown: false });
  }, [navigation]);

  const { id } = (route.params ?? {}) as { id?: string | number };
  const printerId = Number(id);
  const validPrinterId = Number.isFinite(printerId) && printerId > 0;

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

  const refreshCamera = useCallback(async () => {
    setStreamError(false);
    setStreamLoading(true);
    setStreamSeed(Date.now());
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['printer', printerId] }),
      queryClient.invalidateQueries({ queryKey: ['printerStatus', printerId] }),
    ]);
  }, [printerId, queryClient]);

  const status = statusQuery.data;
  const printer = printerQuery.data;
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

  const renderState = (
    title: string,
    message: string,
    actionLabel?: string,
    onAction?: () => void,
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
        {actionLabel && onAction ? (
          <PrimaryButton label={actionLabel} onPress={onAction} />
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
        renderState('Camera unavailable', cameraUnavailableReason, validPrinterId ? 'Refresh' : undefined, validPrinterId ? () => void refreshCamera() : undefined)
      ) : streamError ? (
        renderState('Unable to load stream', 'The live camera stream failed to start.', 'Retry stream', () => void refreshCamera())
      ) : streamUrl ? (
        <>
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
            }}
          />
          {streamLoading ? (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={[styles.loadingLabel, { color: colors.text }]}>
                Connecting to live stream…
              </Text>
            </View>
          ) : null}
        </>
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
            {!fullscreen ? (
              <Text style={[styles.toolbarText, { color: colors.text }]}>Refresh</Text>
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
            onPress={() => setFullscreen(current => !current)}
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
          <Text style={[styles.stat, { color: colors.text }]}>
            {Math.round(progress)}%
          </Text>
          <Text style={[styles.stat, { color: colors.textSecondary }]}>
            {status?.layer_num != null && status?.total_layers != null
              ? `Layer ${status.layer_num}/${status.total_layers}`
              : status?.state || 'Idle'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  stream: {
    flex: 1,
    width: '100%',
    height: '100%',
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
    gap: spacing.sm,
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
});
