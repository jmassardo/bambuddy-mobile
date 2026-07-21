import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { MainTabNavigationProp } from '@/navigation/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAuthToken, api } from '@/api/client';
import { useServerStore } from '@/api/server';
import { filterKnownHMSErrors } from '@/components/printers/hmsErrorCatalog';
import { PrinterCardCompact } from '@/components/printers/PrinterCardCompact';
import { PrinterCardControlsSection } from '@/components/printers/PrinterCardControlsSection';
import {
  buildPrinterCardActionIcons,
  PrinterCardDialogs,
} from '@/components/printers/PrinterCardDialogs';
import { PrinterCardDiagnosticsSection } from '@/components/printers/PrinterCardDiagnosticsSection';
import { PrinterCardFilamentSection } from '@/components/printers/PrinterCardFilamentSection';
import { PrinterCardFooter } from '@/components/printers/PrinterCardFooter';
import { PrinterCardHeader } from '@/components/printers/PrinterCardHeader';
import {
  clamp,
  estimateElapsedSeconds,
  getBadgeColor,
  getErrorMessage,
  getStatusLabel,
  SPEED_LEVELS,
  stripExtension,
} from '@/components/printers/PrinterCard.helpers';
import { styles } from '@/components/printers/PrinterCard.styles';
import { PrinterCardStatusSection } from '@/components/printers/PrinterCardStatusSection';
import { PrinterCardTemperatureSection } from '@/components/printers/PrinterCardTemperatureSection';
import type {
  PrinterCardProps,
  SelectedTray,
  TrayPressContext,
} from '@/components/printers/PrinterCard.types';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useTheme } from '@/theme';
import type { ActionSheetAction } from '@/components/common/ActionSheetModal';
import type { AMSTray, MaintenanceStatus, PrinterStatus } from '@/types/api';
import { CheckCircle, Gauge } from 'lucide-react-native';
import { getPrinterModelImagePath, withCacheBuster } from '@/utils/data';

type PrinterStatusWithThumbnail = PrinterStatus & {
  task_thumbnail_url?: string | null;
};

export function PrinterCard({
  printer,
  status,
  queueCount = 0,
  maintenance,
  spoolAssignments,
  loading = false,
  snapshotSeed = 0,
  selected = false,
  selectionMode = false,
  compact = false,
  onPress,
  onLongPress,
  onToggleSelect,
  onCameraPress,
  onQueuePress,
  onMaintenancePress,
  onPrintPress,
  onTrayPress,
}: PrinterCardProps) {
  const navigation = useNavigation<MainTabNavigationProp>();
  const { colors } = useTheme();
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const serverUrl = useServerStore(state => state.serverUrl);
  const authToken = getAuthToken();
  const actionIcons = buildPrinterCardActionIcons(colors);
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [calibrateSheetVisible, setCalibrateSheetVisible] = useState(false);
  const [moreSheetVisible, setMoreSheetVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [showHmsModal, setShowHmsModal] = useState(false);
  const [skipObjectsVisible, setSkipObjectsVisible] = useState(false);
  const [showSpeedSheet, setShowSpeedSheet] = useState(false);
  const [maintenanceModeTarget, setMaintenanceModeTarget] =
    useState<boolean | null>(null);
  const [deleteSheetVisible, setDeleteSheetVisible] = useState(false);
  const [selectedMaintenanceItem, setSelectedMaintenanceItem] =
    useState<MaintenanceStatus | null>(null);
  const [selectedTray, setSelectedTray] = useState<SelectedTray | null>(null);
  const authHeaders = useMemo(
    () => (authToken ? { Authorization: 'Bearer ' + authToken } : undefined),
    [authToken],
  );

  const isConnected = status?.connected ?? false;
  const isPrinting = status?.state === 'RUNNING' || status?.state === 'PAUSE';
  const isPaused = status?.state === 'PAUSE';
  const isPrintingWithObjects =
    isPrinting && (status?.printable_objects_count ?? 0) > 0;
  const taskThumbnailUrl = (status as PrinterStatusWithThumbnail | undefined)
    ?.task_thumbnail_url;
  const hmsErrors = filterKnownHMSErrors(status?.hms_errors ?? []);
  const badgeLabel = getStatusLabel(status);
  const badgeColor = getBadgeColor(printer, status, colors, hmsErrors);
  const currentPrintName = stripExtension(
    status?.subtask_name || status?.current_print || status?.gcode_file,
  );
  const progress = clamp(status?.progress ?? 0);
  const elapsedSeconds = estimateElapsedSeconds(progress, status?.remaining_time);
  const speedInfo = SPEED_LEVELS[status?.speed_level ?? 2] ?? SPEED_LEVELS[2];
  const maintenanceCount =
    (maintenance?.dueCount ?? 0) + (maintenance?.warningCount ?? 0);
  const canCamera = hasPermission('camera:view') && !!onCameraPress;
  const canPrintControl = isPrinting && hasPermission('printers:control');
  const canControlPrinter = isConnected && hasPermission('printers:control');
  const canBrowse = !!onPrintPress;
  const canEditPrinter = hasPermission('printers:update');
  const canDeletePrinter = hasPermission('printers:delete');
  const canSkipObjects = hasPermission('printers:control');
  const canClearPlate =
    Boolean(status?.awaiting_plate_clear) &&
    !isPrinting &&
    hasPermission('printers:clear_plate');

  const invalidatePrinterQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['printerStatus', printer.id] }),
      queryClient.invalidateQueries({ queryKey: ['printer', printer.id] }),
      queryClient.invalidateQueries({ queryKey: ['queue'] }),
      queryClient.invalidateQueries({ queryKey: ['maintenanceTasks'] }),
      queryClient.invalidateQueries({ queryKey: ['currentPrintUser', printer.id] }),
    ]);
  }, [printer.id, queryClient]);

  const printerImageUrl = useMemo(() => {
    if (!serverUrl) return null;
    return `${serverUrl}${getPrinterModelImagePath(printer.model)}`;
  }, [printer.model, serverUrl]);

  const printerImageSource = useMemo(() => {
    if (!printerImageUrl) return null;
    return {
      uri: printerImageUrl,
      headers: authHeaders,
    };
  }, [authHeaders, printerImageUrl]);

  const partPreviewSource = useMemo(() => {
    if (!isPrinting) return null;

    const directThumbnailUrl = taskThumbnailUrl ?? status?.cover_url ?? null;
    const resolveServerAssetUrl = (url: string) => {
      if (/^https?:\/\//i.test(url)) return url;
      if (!serverUrl) return null;
      return `${serverUrl}${url.startsWith('/') ? '' : '/'}${url}`;
    };

    const resolvedDirectUrl =
      directThumbnailUrl != null ? resolveServerAssetUrl(directThumbnailUrl) : null;
    if (resolvedDirectUrl) {
      return {
        uri: withCacheBuster(resolvedDirectUrl, snapshotSeed),
        headers: authHeaders,
      };
    }

    if (status?.current_archive_id != null) {
      const archiveThumbnailUrl =
        status.current_plate_id != null
          ? api.getArchivePlateThumbnail(
              status.current_archive_id,
              status.current_plate_id,
            )
          : api.getArchiveThumbnail(status.current_archive_id);
      return {
        uri: withCacheBuster(archiveThumbnailUrl, snapshotSeed),
        headers: authHeaders,
      };
    }

    return printerImageSource;
  }, [
    authHeaders,
    isPrinting,
    printerImageSource,
    serverUrl,
    snapshotSeed,
    status?.cover_url,
    status?.current_archive_id,
    status?.current_plate_id,
    taskThumbnailUrl,
  ]);

  const currentPrintUserQuery = useQuery({
    queryKey: ['currentPrintUser', printer.id],
    queryFn: async () =>
      (await api.getCurrentPrintUser(printer.id)) as { username: string | null },
    enabled: isPrinting,
    staleTime: 15_000,
  });

  const actionMutation = useMutation({
    mutationFn: async (action: 'pause' | 'resume' | 'stop') => {
      if (action === 'pause') return api.pausePrint(printer.id);
      if (action === 'resume') return api.resumePrint(printer.id);
      return api.stopPrint(printer.id);
    },
    onSuccess: async (_, action) => {
      await invalidatePrinterQueries();
      showToast(`Printer ${action} command sent.`, 'success');
    },
    onError: error =>
      showToast(getErrorMessage(error, 'Printer command failed.'), 'error'),
  });

  const lightMutation = useMutation({
    mutationFn: async () => api.setChamberLight(printer.id, !status?.chamber_light),
    onSuccess: async () => {
      await invalidatePrinterQueries();
      showToast(
        status?.chamber_light
          ? 'Chamber light turned off.'
          : 'Chamber light turned on.',
        'success',
      );
    },
    onError: error =>
      showToast(getErrorMessage(error, 'Could not update chamber light.'), 'error'),
  });

  const speedMutation = useMutation({
    mutationFn: async (mode: number) => api.setPrintSpeed(printer.id, mode),
    onSuccess: async () => {
      await invalidatePrinterQueries();
      showToast('Print speed updated.', 'success');
    },
    onError: error =>
      showToast(getErrorMessage(error, 'Failed to update print speed.'), 'error'),
  });

  const clearPlateMutation = useMutation({
    mutationFn: async () => api.clearPlate(printer.id),
    onSuccess: async () => {
      await invalidatePrinterQueries();
      showToast('Plate marked as cleared.', 'success');
    },
    onError: error =>
      showToast(getErrorMessage(error, 'Could not update plate status.'), 'error'),
  });

  const calibrateMutation = useMutation({
    mutationFn: async (axes: 'z' | 'xy' | 'all') => api.homeAxes(printer.id, axes),
    onSuccess: async (_, axes) => {
      await invalidatePrinterQueries();
      showToast(
        axes === 'z'
          ? 'Auto-level bed started.'
          : axes === 'all'
            ? 'Homing all axes started.'
            : 'Homing XY started.',
        'success',
      );
    },
    onError: error =>
      showToast(getErrorMessage(error, 'Calibration command failed.'), 'error'),
  });

  const maintenanceMutation = useMutation({
    mutationFn: async (nextIsActive: boolean) =>
      api.updatePrinter(printer.id, { is_active: nextIsActive }),
    onSuccess: async (_, nextIsActive) => {
      await invalidatePrinterQueries();
      showToast(
        nextIsActive
          ? `${printer.name} is back online.`
          : `${printer.name} is now in maintenance mode.`,
        'success',
      );
    },
    onError: error =>
      showToast(getErrorMessage(error, 'Could not update maintenance mode.'), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => api.deletePrinter(printer.id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['printers'] }),
        invalidatePrinterQueries(),
      ]);
      showToast(`${printer.name} deleted.`, 'success');
      if (typeof navigation.canGoBack === 'function' && navigation.canGoBack()) {
        navigation.goBack();
      }
    },
    onError: error =>
      showToast(getErrorMessage(error, 'Could not delete printer.'), 'error'),
  });

  const handleRefresh = useCallback(async () => {
    await invalidatePrinterQueries();
    showToast('Refreshing printer status…', 'success');
  }, [invalidatePrinterQueries, showToast]);

  const handleTrayPress = useCallback(
    (tray: AMSTray, context: TrayPressContext) => {
      if (onTrayPress) {
        onTrayPress(tray, context);
        return;
      }
      setSelectedTray({ tray, context });
    },
    [onTrayPress],
  );

  const handleCompleteSelectedMaintenance = useCallback(async () => {
    if (!selectedMaintenanceItem) return;
    const item = selectedMaintenanceItem;
    setSelectedMaintenanceItem(null);
    try {
      await api.performMaintenance(item.id);
      await queryClient.invalidateQueries({ queryKey: ['maintenanceTasks'] });
      showToast(`${item.maintenance_type_name} marked complete`, 'success');
    } catch (error) {
      showToast(getErrorMessage(error, 'Could not complete task'), 'error');
    }
  }, [queryClient, selectedMaintenanceItem, showToast]);

  const speedActions = useMemo<ActionSheetAction[]>(
    () => [
      ...Object.entries(SPEED_LEVELS).map(([value, info]) => {
        const selectedSpeed = Number(value) === (status?.speed_level ?? 2);
        return {
          label: `${info.label} (${info.percent})`,
          icon: (
            <Gauge
              size={18}
              color={selectedSpeed ? colors.accent : colors.text}
              strokeWidth={2}
            />
          ),
          onPress: () => {
            setShowSpeedSheet(false);
            speedMutation.mutate(Number(value));
          },
          disabled: !canControlPrinter || speedMutation.isPending,
          loading: speedMutation.isPending && selectedSpeed,
        };
      }),
      {
        label: 'Cancel',
        icon: actionIcons.cancel,
        onPress: () => setShowSpeedSheet(false),
      },
    ],
    [
      actionIcons.cancel,
      canControlPrinter,
      colors.accent,
      colors.text,
      speedMutation,
      status?.speed_level,
    ],
  );

  const maintenanceModeActions = useMemo<ActionSheetAction[]>(
    () => [
      {
        label: 'Cancel',
        icon: actionIcons.cancel,
        onPress: () => setMaintenanceModeTarget(null),
      },
      {
        label: maintenanceModeTarget ? 'Disable' : 'Enable',
        icon: actionIcons.wrench,
        onPress: () => {
          if (maintenanceModeTarget == null) return;
          setMaintenanceModeTarget(null);
          maintenanceMutation.mutate(maintenanceModeTarget);
        },
        destructive: maintenanceModeTarget === false,
        disabled: maintenanceModeTarget == null || maintenanceMutation.isPending,
        loading: maintenanceMutation.isPending,
      },
    ],
    [
      actionIcons.cancel,
      actionIcons.wrench,
      maintenanceModeTarget,
      maintenanceMutation,
    ],
  );

  const deleteActions = useMemo<ActionSheetAction[]>(
    () => [
      {
        label: 'Cancel',
        icon: actionIcons.cancel,
        onPress: () => setDeleteSheetVisible(false),
      },
      {
        label: 'Delete',
        icon: actionIcons.delete,
        onPress: () => {
          setDeleteSheetVisible(false);
          deleteMutation.mutate();
        },
        destructive: true,
        disabled: deleteMutation.isPending,
        loading: deleteMutation.isPending,
      },
    ],
    [actionIcons.cancel, actionIcons.delete, deleteMutation],
  );

  const maintenanceItemActions = useMemo<ActionSheetAction[]>(
    () => [
      {
        label: 'Cancel',
        icon: actionIcons.cancel,
        onPress: () => setSelectedMaintenanceItem(null),
      },
      {
        label: 'Mark complete',
        icon: actionIcons.complete,
        onPress: () => {
          void handleCompleteSelectedMaintenance();
        },
      },
    ],
    [actionIcons.cancel, actionIcons.complete, handleCompleteSelectedMaintenance],
  );

  const calibrateActions = useMemo<ActionSheetAction[]>(
    () => [
      {
        label: 'Auto-level bed',
        icon: actionIcons.rotate,
        onPress: () => {
          setCalibrateSheetVisible(false);
          calibrateMutation.mutate('z');
        },
        disabled: !canControlPrinter || calibrateMutation.isPending,
        loading: calibrateMutation.isPending,
      },
      {
        label: 'Home all axes',
        icon: actionIcons.move,
        onPress: () => {
          setCalibrateSheetVisible(false);
          calibrateMutation.mutate('all');
        },
        disabled: !canControlPrinter || calibrateMutation.isPending,
        loading: calibrateMutation.isPending,
      },
      {
        label: 'Home XY',
        icon: actionIcons.move,
        onPress: () => {
          setCalibrateSheetVisible(false);
          calibrateMutation.mutate('xy');
        },
        disabled: !canControlPrinter || calibrateMutation.isPending,
        loading: calibrateMutation.isPending,
      },
    ],
    [actionIcons.move, actionIcons.rotate, calibrateMutation, canControlPrinter],
  );

  const moreActions = useMemo<ActionSheetAction[]>(
    () => [
      {
        label: 'Edit',
        onPress: () => {
          setMoreSheetVisible(false);
          setEditModalVisible(true);
        },
        icon: actionIcons.edit,
        disabled: !canEditPrinter,
      },
      {
        label:
          printer.is_active === false
            ? 'Disable maintenance mode'
            : 'Enable maintenance mode',
        onPress: () => {
          setMoreSheetVisible(false);
          setMaintenanceModeTarget(!printer.is_active);
        },
        icon: actionIcons.wrench,
        disabled: !canEditPrinter || maintenanceMutation.isPending,
        loading: maintenanceMutation.isPending,
      },
      {
        label: 'Delete',
        onPress: () => {
          setMoreSheetVisible(false);
          setDeleteSheetVisible(true);
        },
        icon: actionIcons.delete,
        destructive: true,
        disabled: !canDeletePrinter || deleteMutation.isPending,
        loading: deleteMutation.isPending,
      },
    ],
    [
      actionIcons.delete,
      actionIcons.edit,
      actionIcons.wrench,
      canDeletePrinter,
      canEditPrinter,
      deleteMutation,
      maintenanceMutation,
      printer.is_active,
    ],
  );

  if (compact) {
    return (
      <PrinterCardCompact
        printer={printer}
        selected={selected}
        isConnected={isConnected}
        isPrinting={isPrinting}
        progress={progress}
        printerImageSource={printerImageSource}
        onPress={onPress}
        onLongPress={onLongPress}
      />
    );
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: selected ? colors.accentBg : colors.card,
          borderColor: selected ? colors.accent : colors.cardBorder,
        },
      ]}
    >
      <PrinterCardHeader
        printer={printer}
        status={status}
        badgeLabel={badgeLabel}
        badgeColor={badgeColor}
        hmsErrors={hmsErrors}
        queueCount={queueCount}
        maintenance={maintenance}
        maintenanceCount={maintenanceCount}
        printerImageSource={printerImageSource}
        onPress={onPress}
        onQueuePress={onQueuePress}
        onMaintenancePress={onMaintenancePress}
        onShowHmsModal={() => setShowHmsModal(true)}
      />

      <PrinterCardStatusSection
        status={status}
        badgeLabel={badgeLabel}
        badgeColor={badgeColor}
        currentPrintName={currentPrintName}
        progress={progress}
        elapsedSeconds={elapsedSeconds}
        speedInfo={speedInfo}
        loading={loading}
        isPrinting={isPrinting}
        currentPrintUserName={currentPrintUserQuery.data?.username}
        partPreviewSource={partPreviewSource}
      />

      <PrinterCardControlsSection
        status={status}
        canControlPrinter={canControlPrinter}
        canPrintControl={canPrintControl}
        canClearPlate={canClearPlate}
        canSkipObjects={canSkipObjects}
        isPaused={isPaused}
        isPrintingWithObjects={isPrintingWithObjects}
        speedInfo={speedInfo}
        actionPending={actionMutation.isPending}
        lightPending={lightMutation.isPending}
        speedPending={speedMutation.isPending}
        clearPlatePending={clearPlateMutation.isPending}
        onToggleLight={() => lightMutation.mutate()}
        onShowMoveMenu={() => setMoveModalVisible(true)}
        onShowCalibrateMenu={() => setCalibrateSheetVisible(true)}
        onShowSpeedMenu={() => setShowSpeedSheet(true)}
        onRefresh={() => {
          void handleRefresh();
        }}
        onShowSkipObjects={() => setSkipObjectsVisible(true)}
        onTogglePause={() =>
          actionMutation.mutate(isPaused ? 'resume' : 'pause')
        }
        onStop={() => actionMutation.mutate('stop')}
        onClearPlate={() => clearPlateMutation.mutate()}
      />

      <PrinterCardTemperatureSection printer={printer} status={status} />

      <PrinterCardFilamentSection
        printer={printer}
        status={status}
        spoolAssignments={spoolAssignments}
        onTrayPress={handleTrayPress}
      />

      <PrinterCardDiagnosticsSection
        status={status}
        hmsErrors={hmsErrors}
        maintenance={maintenance}
        onSelectMaintenanceItem={setSelectedMaintenanceItem}
      />

      <PrinterCardFooter
        canCamera={canCamera}
        canBrowse={canBrowse}
        onCameraPress={onCameraPress}
        onPrintPress={onPrintPress}
        onShowMoreMenu={() => setMoreSheetVisible(true)}
      />

      <PrinterCardDialogs
        printer={printer}
        isPrinting={isPrinting}
        hmsErrors={hmsErrors}
        selectedTray={selectedTray}
        moveModalVisible={moveModalVisible}
        showHmsModal={showHmsModal}
        skipObjectsVisible={skipObjectsVisible}
        editModalVisible={editModalVisible}
        showSpeedSheet={showSpeedSheet}
        maintenanceModeTarget={maintenanceModeTarget}
        deleteSheetVisible={deleteSheetVisible}
        selectedMaintenanceItem={selectedMaintenanceItem}
        calibrateSheetVisible={calibrateSheetVisible}
        moreSheetVisible={moreSheetVisible}
        speedActions={speedActions}
        maintenanceModeActions={maintenanceModeActions}
        deleteActions={deleteActions}
        maintenanceItemActions={maintenanceItemActions}
        calibrateActions={calibrateActions}
        moreActions={moreActions}
        onCloseMoveModal={() => setMoveModalVisible(false)}
        onCloseHmsModal={() => setShowHmsModal(false)}
        onCloseTrayModal={() => setSelectedTray(null)}
        onCloseSkipObjectsModal={() => setSkipObjectsVisible(false)}
        onCloseEditModal={() => setEditModalVisible(false)}
        onCloseSpeedSheet={() => setShowSpeedSheet(false)}
        onCloseMaintenanceModeSheet={() => setMaintenanceModeTarget(null)}
        onCloseDeleteSheet={() => setDeleteSheetVisible(false)}
        onCloseMaintenanceItemSheet={() => setSelectedMaintenanceItem(null)}
        onCloseCalibrateSheet={() => setCalibrateSheetVisible(false)}
        onCloseMoreSheet={() => setMoreSheetVisible(false)}
      />

      {selectionMode ? (
        <>
          <Pressable
            onPress={onToggleSelect}
            onLongPress={onLongPress}
            style={styles.selectionCover}
          />
          <View
            style={[
              styles.selectionBadge,
              {
                backgroundColor: selected ? colors.accent : colors.overlay,
                borderColor: selected ? colors.accent : colors.border,
              },
            ]}
          >
            {selected ? (
              <CheckCircle size={16} color={colors.textInverse} strokeWidth={2} />
            ) : null}
          </View>
        </>
      ) : null}
    </View>
  );
}
