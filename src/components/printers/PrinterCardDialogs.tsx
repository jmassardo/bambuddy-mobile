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
  const { colors } = useTheme();
  const maintenanceTitle = maintenanceModeTarget
    ? 'Disable maintenance mode'
    : 'Enable maintenance mode';
  const maintenanceSubtitle = maintenanceModeTarget
    ? `${printer.name} will return to active service.`
    : `${printer.name} will stop accepting normal printer actions until maintenance mode is disabled.`;
  const maintenanceItemSubtitle =
    selectedMaintenanceItem == null
      ? undefined
      : selectedMaintenanceItem.is_due
        ? 'This task is overdue. Mark as completed?'
        : `This task is due soon (${selectedMaintenanceItem.interval_type === 'days' ? `${selectedMaintenanceItem.days_until_due ?? 0} days left` : `${Math.round(selectedMaintenanceItem.hours_until_due)}h left`}). Mark as completed?`;

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
        title="Print speed"
        subtitle="Choose a print speed."
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
        title="Delete printer"
        subtitle={`Delete ${printer.name}? This cannot be undone.`}
        onClose={onCloseDeleteSheet}
        actions={deleteActions}
      />

      <ActionSheetModal
        visible={selectedMaintenanceItem != null}
        title={selectedMaintenanceItem?.maintenance_type_name ?? 'Maintenance'}
        subtitle={maintenanceItemSubtitle}
        onClose={onCloseMaintenanceItemSheet}
        actions={maintenanceItemActions}
      />

      <ActionSheetModal
        visible={calibrateSheetVisible}
        title="Calibration"
        subtitle="Choose a printer homing action."
        onClose={onCloseCalibrateSheet}
        actions={calibrateActions}
      />

      <ActionSheetModal
        visible={moreSheetVisible}
        title={printer.name}
        subtitle={printer.model || 'Printer options'}
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
