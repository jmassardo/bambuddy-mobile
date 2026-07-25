import type { ImageSourcePropType } from 'react-native';
import type { TrayDetailContext } from '@/components/printers/TrayDetailModal';
import type {
  AMSTray,
  HMSError,
  MaintenanceStatus,
  Printer,
  PrinterStatus,
  SpoolAssignment,
} from '@/types/api';

export interface MaintenanceSummary {
  dueCount: number;
  warningCount: number;
  items: MaintenanceStatus[];
}

export type TrayPressContext = TrayDetailContext;

export interface SelectedTray {
  tray: AMSTray;
  context: TrayPressContext;
}

export interface PrinterCardProps {
  printer: Printer;
  status?: PrinterStatus;
  queueCount?: number;
  maintenance?: MaintenanceSummary;
  spoolAssignments?: SpoolAssignment[];
  loading?: boolean;
  snapshotSeed?: number | string;
  selected?: boolean;
  selectionMode?: boolean;
  compact?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  onToggleSelect?: () => void;
  onCameraPress?: () => void;
  onQueuePress?: () => void;
  onMaintenancePress?: () => void;
  onPrintPress?: () => void;
  onTrayPress?: (tray: AMSTray, context: TrayPressContext) => void;
}

export interface PrinterCardHeaderProps {
  printer: Printer;
  status?: PrinterStatus;
  badgeLabel: string;
  badgeColor: string;
  hmsErrors: HMSError[];
  queueCount: number;
  maintenance?: MaintenanceSummary;
  maintenanceCount: number;
  printerImageSource: ImageSourcePropType | null;
  onPress?: () => void;
  onQueuePress?: () => void;
  onMaintenancePress?: () => void;
  onShowHmsModal: () => void;
}
