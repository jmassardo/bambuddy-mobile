import { translateNative, useNativeLocale, useTranslation } from '@/i18n';

import React from 'react';
import { CheckCircle, Move, Pencil, RotateCcw, Trash2, Wrench, X } from 'lucide-react-native';
import { ActionSheetModal, type ActionSheetAction } from '@/components/common/ActionSheetModal';
import { EditPrinterModal } from '@/components/printers/EditPrinterModal';
import { HMSErrorModal } from '@/components/printers/HMSErrorModal';
import { MoveControlsModal } from '@/components/printers/MoveControlsModal';
import { SkipObjectsModal } from '@/components/printers/SkipObjectsModal';
import { TrayDetailModal } from '@/components/printers/TrayDetailModal';
import { useTheme } from '@/theme';

import type { HMSError, MaintenanceStatus, Printer } from '@/types/api';
import type { SelectedTray } from '@/components/printers/PrinterCard.types';

interface PrinterCardDialogsProps {
  printer: Printer;
  isPrinting: boolean;
  hmsErrors: HMSError[];
  selectedTray: SelectedTray | null;
  moveModalVisible: boolean;
  showHmsModal: boolean;
  skipObjectsVisible: boolean;
  editModalVisible: boolean;
  showSpeedSheet: boolean;
  maintenanceModeTarget: boolean | null;
  deleteSheetVisible: boolean;
  selectedMaintenanceItem: MaintenanceStatus | null;
  calibrateSheetVisible: boolean;
  moreSheetVisible: boolean;
  speedActions: ActionSheetAction[];
  maintenanceModeActions: ActionSheetAction[];
  deleteActions: ActionSheetAction[];
  maintenanceItemActions: ActionSheetAction[];
  calibrateActions: ActionSheetAction[];
  moreActions: ActionSheetAction[];
  onCloseMoveModal: () => void;
  onCloseHmsModal: () => void;
  onCloseTrayModal: () => void;
  onCloseSkipObjectsModal: () => void;
  onCloseEditModal: () => void;
  onCloseSpeedSheet: () => void;
  onCloseMaintenanceModeSheet: () => void;
  onCloseDeleteSheet: () => void;
  onCloseMaintenanceItemSheet: () => void;
  onCloseCalibrateSheet: () => void;
  onCloseMoreSheet: () => void;
}

export function PrinterCardDialogs({
  printer,
  isPrinting,
  hmsErrors,
  selectedTray,
  moveModalVisible,
  showHmsModal,
  skipObjectsVisible,
  editModalVisible,
  showSpeedSheet,
  maintenanceModeTarget,
  deleteSheetVisible,
  selectedMaintenanceItem,
  calibrateSheetVisible,
  moreSheetVisible,
  speedActions,
  maintenanceModeActions,
  deleteActions,
  maintenanceItemActions,
  calibrateActions,
  moreActions,
  onCloseMoveModal,
  onCloseHmsModal,
  onCloseTrayModal,
  onCloseSkipObjectsModal,
  onCloseEditModal,
  onCloseSpeedSheet,
  onCloseMaintenanceModeSheet,
  onCloseDeleteSheet,
  onCloseMaintenanceItemSheet,
  onCloseCalibrateSheet,
  onCloseMoreSheet,
}: PrinterCardDialogsProps) {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const maintenanceTitle = maintenanceModeTarget
    ? translateNative('native.23c7f8fe03169d26')
    : translateNative('native.4ccdcd0ec3e25a51');
  const maintenanceSubtitle = maintenanceModeTarget
    ? translateNative('native.b3eac0d4bf3d2704', { value0: String(printer.name) })
    : translateNative('native.ca10030e0dff733f', { value0: String(printer.name) });
  const maintenanceItemSubtitle =
    selectedMaintenanceItem == null
      ? undefined
      : selectedMaintenanceItem.is_due
        ? translateNative('native.990ec1a5a0ea2465')
        : translateNative('native.b1c1a1967e180078', { value0: String(selectedMaintenanceItem.interval_type === 'days' ? translateNative('native.8c7440ee660a4ee7', { value0: String(selectedMaintenanceItem.days_until_due ?? 0) }) : translateNative('native.9151531b4eedd411', { value0: String(Math.round(selectedMaintenanceItem.hours_until_due)) })) });

  return (
    <>
      <MoveControlsModal
        visible={moveModalVisible}
        printerId={printer.id}
        printerName={printer.name}
        isPrinting={isPrinting}
        onClose={onCloseMoveModal}
      />

      <HMSErrorModal
        visible={showHmsModal}
        printerId={printer.id}
        printerName={printer.name}
        errors={hmsErrors}
        onClose={onCloseHmsModal}
      />

      <TrayDetailModal
        visible={selectedTray != null}
        printerId={printer.id}
        tray={selectedTray?.tray ?? null}
        context={selectedTray?.context ?? null}
        isPrinting={isPrinting}
        onClose={onCloseTrayModal}
      />

      <SkipObjectsModal
        visible={skipObjectsVisible}
        printerId={printer.id}
        onClose={onCloseSkipObjectsModal}
      />

      <EditPrinterModal
        visible={editModalVisible}
        printer={editModalVisible ? printer : null}
        onClose={onCloseEditModal}
      />

      <ActionSheetModal
        visible={showSpeedSheet}
        title={translateNative('native.e995e9dc044f397a')}
        subtitle={translateNative('native.0563b5c522129d1e')}
        onClose={onCloseSpeedSheet}
        actions={speedActions}
      />

      <ActionSheetModal
        visible={maintenanceModeTarget != null}
        title={maintenanceTitle}
        subtitle={maintenanceSubtitle}
        onClose={onCloseMaintenanceModeSheet}
        actions={maintenanceModeActions}
      />

      <ActionSheetModal
        visible={deleteSheetVisible}
        title={translateNative('native.1412aa7b38351bde')}
        subtitle={t('fleet.deleteExplanation', { defaultValue: 'Delete {{printer}}? Choose whether to keep its archives or permanently delete them too. Cancellation changes nothing.', printer: printer.name })}
        onClose={onCloseDeleteSheet}
        actions={deleteActions}
      />

      <ActionSheetModal
        visible={selectedMaintenanceItem != null}
        title={selectedMaintenanceItem?.maintenance_type_name ?? translateNative('nav.maintenance')}
        subtitle={maintenanceItemSubtitle}
        onClose={onCloseMaintenanceItemSheet}
        actions={maintenanceItemActions}
      />

      <ActionSheetModal
        visible={calibrateSheetVisible}
        title={translateNative('native.d508e0a93ba56db2')}
        subtitle={translateNative('native.23ce27b677bdbf92')}
        onClose={onCloseCalibrateSheet}
        actions={calibrateActions}
      />

      <ActionSheetModal
        visible={moreSheetVisible}
        title={printer.name}
        subtitle={printer.model || translateNative('native.485dd7e50a2b0015')}
        onClose={onCloseMoreSheet}
        actions={moreActions.map(action => {
          if (action.label === 'Edit') {
            return {
              ...action,
              icon: <Pencil size={18} color={colors.text} strokeWidth={2} />,
            };
          }
          if (action.label === 'Delete') {
            return {
              ...action,
              icon: <Trash2 size={18} color={colors.error} strokeWidth={2} />,
            };
          }
          return {
            ...action,
            icon: <Wrench size={18} color={colors.text} strokeWidth={2} />,
          };
        })}
      />
    </>
  );
}

export function buildPrinterCardActionIcons(colors: ReturnType<typeof useTheme>['colors']) {
  return {
    cancel: <X size={18} color={colors.textSecondary} strokeWidth={2} />,
    wrench: <Wrench size={18} color={colors.text} strokeWidth={2} />,
    delete: <Trash2 size={18} color={colors.error} strokeWidth={2} />,
    complete: <CheckCircle size={18} color={colors.text} strokeWidth={2} />,
    rotate: <RotateCcw size={18} color={colors.text} strokeWidth={2} />,
    move: <Move size={18} color={colors.text} strokeWidth={2} />,
    edit: <Pencil size={18} color={colors.text} strokeWidth={2} />,
  };
}
