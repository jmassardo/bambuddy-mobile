import { nativeMessage, translateNative, useLocalizedMemo, useNativeLocale, useTranslation } from '@/i18n';


import React, { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { FirmwareModal } from './FirmwareModal';
import { FleetModal } from './FleetModal';
import { MQTTConsole } from './MQTTConsole';
import { NextQueueJob } from './NextQueueJob';

import { useNavigation } from '@react-navigation/native';
import type { MainTabNavigationProp } from '@/navigation/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAuthToken, api } from '@/api/client';
import { useServerStore } from '@/api/server';
import { filterKnownHMSErrors } from '@/components/printers/hmsErrorCatalog';
import { PrinterCardCompact } from '@/components/printers/PrinterCardCompact';
import { PrinterSourceActions } from '@/components/printers/PrinterSourceActions';
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
  nextQueueJob,
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
  useNativeLocale();
  const navigation = useNavigation<MainTabNavigationProp>();
  const { colors } = useTheme();
  const { t } = useTranslation();
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
  const [firmwareVisible, setFirmwareVisible] = useState(false);
  const [mqttVisible, setMqttVisible] = useState(false);
  const [selectedMaintenanceItem, setSelectedMaintenanceItem] =
    useState<MaintenanceStatus | null>(null);
  const [selectedTray, setSelectedTray] = useState<SelectedTray | null>(null);
  const authHeaders = useLocalizedMemo(
    () => (authToken ? { Authorization: 'Bearer ' + authToken } : undefined),
    [authToken],
  );

  const isConnected = status?.connected ?? false;
  const isPrinting = status?.state === 'RUNNING' || status?.state === 'PAUSE';
  const isPaused = status?.state === 'PAUSE';
  const isPrintingWithObjects = isPrinting;
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
  const canPrintControl = isConnected && isPrinting && printer.is_active !== false && hasPermission('printers:control');
  const canControlPrinter = isConnected && hasPermission('printers:control');
  const canBrowse = !!onPrintPress;
  const canEditPrinter = hasPermission('printers:update');
  const canDeletePrinter = hasPermission('printers:delete');
  const canSkipObjects = hasPermission('printers:control');
  const canClearPlate =
    isConnected &&
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

  const printerImageUrl = useLocalizedMemo(() => {
    if (!serverUrl) return null;
    return `${serverUrl}${getPrinterModelImagePath(printer.model)}`;
  }, [printer.model, serverUrl]);

  const printerImageSource = useLocalizedMemo(() => {
    if (!printerImageUrl) return null;
    return {
      uri: printerImageUrl,
      headers: authHeaders,
    };
  }, [authHeaders, printerImageUrl]);

  const partPreviewSource = useLocalizedMemo(() => {
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
      showToast(nativeMessage('native.bf4d8ef589e7fea8', () => ({ value0: String(action) })), 'success');
    },
    onError: error =>
      showToast(getErrorMessage(error, nativeMessage('native.057caadfef404064')), 'error'),
  });
  const confirmPrintAction = (action: 'pause' | 'resume' | 'stop') => {
    Alert.alert(
      t('fleet.confirmAction', { defaultValue: '{{action}} print?', action }),
      t('fleet.confirmPrintContext', { defaultValue: '{{printer}} — {{job}}. {{consequence}}', printer: printer.name, job: currentPrintName || t('fleet.activeJob', { defaultValue: 'Active print' }), consequence: action === 'stop' ? t('fleet.stopConsequence', { defaultValue: 'This stops the physical printer; this print cannot be resumed.' }) : '' }),
      [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        { text: t('common.confirm', { defaultValue: 'Confirm' }), style: action === 'stop' ? 'destructive' : 'default', onPress: () => actionMutation.mutate(action) },
      ],
    );
  };
  const transportMutation = useMutation({
    mutationFn: async (command: 'reconnect' | 'republish') => {
      if (command === 'reconnect') {
        const result = await api.connectPrinter(printer.id);
        if (!result.connected) throw new Error(t('fleet.reconnectFailed', { defaultValue: 'Printer transport could not connect.' }));
      }
      else await api.refreshPrinterStatus(printer.id);
    },
    onSuccess: async (_, command) => {
      await invalidatePrinterQueries();
      showToast(nativeMessage('fleet.transportSent', () => ({ defaultValue: '{{command}} requested for {{printer}}.', command, printer: printer.name })), 'success');
    },
    onError: error => showToast(getErrorMessage(error, nativeMessage('fleet.transportFailed', () => ({ defaultValue: 'Printer transport command failed.' }))), 'error'),
  });

  const lightMutation = useMutation({
    mutationFn: async () => api.setChamberLight(printer.id, !status?.chamber_light),
    onSuccess: async () => {
      await invalidatePrinterQueries();
      showToast(
        status?.chamber_light ? nativeMessage('native.b7f99a005cd8c13a') : nativeMessage('native.ddaab30a09d7974e'),
        'success',
      );
    },
    onError: error =>
      showToast(getErrorMessage(error, nativeMessage('native.7dfae4b67f12c34d')), 'error'),
  });

  const speedMutation = useMutation({
    mutationFn: async (mode: number) => api.setPrintSpeed(printer.id, mode),
    onSuccess: async () => {
      await invalidatePrinterQueries();
      showToast(nativeMessage('native.d6bfbabf9cc21bd9'), 'success');
    },
    onError: error =>
      showToast(getErrorMessage(error, nativeMessage('native.314b832477b6a5e3')), 'error'),
  });

  const clearPlateMutation = useMutation({
    mutationFn: async () => api.clearPlate(printer.id),
    onSuccess: async () => {
      await invalidatePrinterQueries();
      showToast(nativeMessage('native.56e6d48a7c32e573'), 'success');
    },
    onError: error =>
      showToast(getErrorMessage(error, nativeMessage('native.4ff3522ac25145ed')), 'error'),
  });

  const calibrateMutation = useMutation({
    mutationFn: async (axes: 'z' | 'xy' | 'all') => api.homeAxes(printer.id, axes),
    onSuccess: async (_, axes) => {
      await invalidatePrinterQueries();
      showToast(
        axes === 'z' ? nativeMessage('native.d6a31ed51697c3be') : axes === 'all' ? nativeMessage('native.ee8c26dd8eaa822c') : nativeMessage('native.33dd054dc4ccf586'),
        'success',
      );
    },
    onError: error =>
      showToast(getErrorMessage(error, nativeMessage('native.63a718e698f55b36')), 'error'),
  });

  const maintenanceMutation = useMutation({
    mutationFn: async (nextIsActive: boolean) =>
      api.updatePrinter(printer.id, { is_active: nextIsActive }),
    onSuccess: async (_, nextIsActive) => {
      await invalidatePrinterQueries();
      showToast(
        nextIsActive ? nativeMessage('native.714590bfc443618f', () => ({ value0: String(printer.name) })) : nativeMessage('native.24e8f04048088c89', () => ({ value0: String(printer.name) })),
        'success',
      );
    },
    onError: error =>
      showToast(getErrorMessage(error, nativeMessage('native.10b514e28f1f7747')), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (deleteArchives: boolean) => api.deletePrinter(printer.id, deleteArchives),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['printers'] }),
        invalidatePrinterQueries(),
      ]);
      showToast(nativeMessage('native.61fb3457172f324c', () => ({ value0: String(printer.name) })), 'success');
      if (typeof navigation.canGoBack === 'function' && navigation.canGoBack()) {
        navigation.goBack();
      }
    },
    onError: error =>
      showToast(getErrorMessage(error, nativeMessage('native.41757ef8044aced8')), 'error'),
  });

  const handleRefresh = useCallback(async () => {
    await invalidatePrinterQueries();
    showToast(nativeMessage('native.a5792391a74b9538'), 'success');
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
      showToast(nativeMessage('native.1c17545f084994f2', () => ({ value0: String(item.maintenance_type_name) })), 'success');
    } catch (error) {
      showToast(getErrorMessage(error, nativeMessage('native.b2692be38053333a')), 'error');
    }
  }, [queryClient, selectedMaintenanceItem, showToast]);

  const speedActions = useLocalizedMemo<ActionSheetAction[]>(
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
        get label() { return translateNative('common.cancel'); },
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

  const maintenanceModeActions = useLocalizedMemo<ActionSheetAction[]>(
    () => [
      {
        get label() { return translateNative('common.cancel'); },
        icon: actionIcons.cancel,
        onPress: () => setMaintenanceModeTarget(null),
      },
      {
        label: maintenanceModeTarget ? translateNative('native.a2b60ae5901891b9') : translateNative('native.b28dde0a75aa64d9'),
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

  const deleteActions = useLocalizedMemo<ActionSheetAction[]>(
    () => [
      {
        get label() { return translateNative('common.cancel'); },
        icon: actionIcons.cancel,
        onPress: () => setDeleteSheetVisible(false),
      },
      {
        get label() { return translateNative('fleet.deleteKeepArchives', { defaultValue: 'Delete printer · keep archives' }); },
        icon: actionIcons.delete,
        onPress: () => {
          setDeleteSheetVisible(false);
          deleteMutation.mutate(false);
        },
        destructive: true,
        disabled: deleteMutation.isPending,
        loading: deleteMutation.isPending,
      },
      {
        get label() { return translateNative('fleet.deleteWithArchives', { defaultValue: 'Delete printer AND archives' }); },
        icon: actionIcons.delete,
        destructive: true,
        disabled: deleteMutation.isPending,
        loading: deleteMutation.isPending,
        onPress: () => {
          Alert.alert(t('fleet.deleteWithArchives', { defaultValue: 'Delete printer AND archives' }), t('fleet.archiveDeletionWarning', { defaultValue: 'All associated archives will be permanently deleted. This cannot be undone.' }), [
            { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
            { text: t('common.delete', { defaultValue: 'Delete' }), style: 'destructive', onPress: () => { setDeleteSheetVisible(false); deleteMutation.mutate(true); } },
          ]);
        },
      },
    ],
    [actionIcons.cancel, actionIcons.delete, deleteMutation, t],
  );

  const maintenanceItemActions = useLocalizedMemo<ActionSheetAction[]>(
    () => [
      {
        get label() { return translateNative('common.cancel'); },
        icon: actionIcons.cancel,
        onPress: () => setSelectedMaintenanceItem(null),
      },
      {
        get label() { return translateNative('native.f105bc3114dcc52d'); },
        icon: actionIcons.complete,
        onPress: () => {
          void handleCompleteSelectedMaintenance();
        },
      },
    ],
    [actionIcons.cancel, actionIcons.complete, handleCompleteSelectedMaintenance],
  );

  const calibrateActions = useLocalizedMemo<ActionSheetAction[]>(
    () => [
      {
        get label() { return translateNative('native.03c46853dc3d5dad'); },
        icon: actionIcons.rotate,
        onPress: () => {
          setCalibrateSheetVisible(false);
          calibrateMutation.mutate('z');
        },
        disabled: !canControlPrinter || calibrateMutation.isPending,
        loading: calibrateMutation.isPending,
      },
      {
        get label() { return translateNative('native.f0dff40b2cb99e27'); },
        icon: actionIcons.move,
        onPress: () => {
          setCalibrateSheetVisible(false);
          calibrateMutation.mutate('all');
        },
        disabled: !canControlPrinter || calibrateMutation.isPending,
        loading: calibrateMutation.isPending,
      },
      {
        get label() { return translateNative('native.0815f3e69f8757d4'); },
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

  const moreActions = useLocalizedMemo<ActionSheetAction[]>(
    () => [
      {
        get label() { return translateNative('fleet.reconnect', { defaultValue: 'Reconnect MQTT transport' }); },
        disabled: !hasPermission('printers:control') || transportMutation.isPending,
        loading: transportMutation.isPending && transportMutation.variables === 'reconnect',
        onPress: () => transportMutation.mutate('reconnect'),
      },
      {
        get label() { return translateNative('fleet.republish', { defaultValue: 'Force device status republish' }); },
        disabled: !isConnected || !hasPermission('printers:read') || transportMutation.isPending,
        loading: transportMutation.isPending && transportMutation.variables === 'republish',
        onPress: () => transportMutation.mutate('republish'),
      },
      {
        get label() { return translateNative('fleet.firmware', { defaultValue: 'Printer firmware' }); },
        disabled: !hasPermission('firmware:read'),
        onPress: () => { setMoreSheetVisible(false); setFirmwareVisible(true); },
      },
      {
        get label() { return translateNative('fleet.mqtt', { defaultValue: 'MQTT console' }); },
        disabled: !hasPermission('printers:read'),
        onPress: () => { setMoreSheetVisible(false); setMqttVisible(true); },
      },
      {
        get label() { return translateNative('common.edit'); },
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
            ? translateNative('native.23c7f8fe03169d26')
            : translateNative('native.4ccdcd0ec3e25a51'),
        onPress: () => {
          setMoreSheetVisible(false);
          setMaintenanceModeTarget(!printer.is_active);
        },
        icon: actionIcons.wrench,
        disabled: !canEditPrinter || maintenanceMutation.isPending,
        loading: maintenanceMutation.isPending,
      },
      {
        get label() { return translateNative('common.delete'); },
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
      t,
      hasPermission,
      transportMutation,
      isConnected,
    ],
  );

  if (compact) {
    return (
      <>
        <PrinterCardCompact
          printer={printer}
          selected={selected}
          isConnected={isConnected}
          isPrinting={isPrinting}
          progress={progress}
          status={status}
          canClearPlate={canClearPlate}
          clearPlatePending={clearPlateMutation.isPending}
          onClearPlate={() => Alert.alert(t('fleet.clearPlate', { defaultValue: 'Mark plate as cleared?' }), t('fleet.clearPlateWarning', { defaultValue: 'Confirm the physical plate is empty. Queued jobs may start automatically.' }), [
            { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
            { text: t('common.confirm', { defaultValue: 'Confirm' }), onPress: () => clearPlateMutation.mutate() },
          ])}
          printerImageSource={printerImageSource}
          onPress={onPress}
          onLongPress={onLongPress}
        />
        <PrinterSourceActions printerId={printer.id} />
      </>
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
        onFirmwarePress={hasPermission('firmware:read') ? () => setFirmwareVisible(true) : undefined}
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
      {nextQueueJob ? <NextQueueJob item={nextQueueJob} additionalCount={Math.max(queueCount - 1, 0)} onPress={onQueuePress} /> : null}
      {firmwareVisible ? <FirmwareModal printerId={printer.id} onClose={() => setFirmwareVisible(false)} /> : null}
      {mqttVisible ? <FleetModal title={t('fleet.mqtt', { defaultValue: 'MQTT console' })} onClose={() => setMqttVisible(false)}><MQTTConsole printerId={printer.id} /></FleetModal> : null}
      {actionMutation.isPending ? <Text accessibilityLiveRegion="polite" style={{ color: colors.textSecondary }}>{t('fleet.actionPending', { defaultValue: 'Sending {{action}} to {{printer}}…', action: actionMutation.variables, printer: printer.name })}</Text> : null}

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
          confirmPrintAction(isPaused ? 'resume' : 'pause')
        }
        onStop={() => confirmPrintAction('stop')}
        onClearPlate={() => Alert.alert(t('fleet.clearPlate', { defaultValue: 'Mark plate as cleared?' }), t('fleet.clearPlateWarning', { defaultValue: 'Confirm the physical plate is empty. Queued jobs may start automatically.' }), [
          { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
          { text: t('common.confirm', { defaultValue: 'Confirm' }), onPress: () => clearPlateMutation.mutate() },
        ])}
      />

      <PrinterCardTemperatureSection printer={printer} status={status} />

      <PrinterSourceActions printerId={printer.id} />

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
