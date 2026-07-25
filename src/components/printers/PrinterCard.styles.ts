import { StyleSheet } from 'react-native';
import { borderRadius, fontSize, fontWeight, spacing } from '@/theme/tokens';

export const styles = StyleSheet.create({
  card: {
    position: 'relative',
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    gap: spacing.md,
  },
  compactCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    gap: spacing.sm,
  },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  compactImageWrap: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  compactImage: {
    width: 36,
    height: 36,
    resizeMode: 'contain',
  },
  compactInfo: {
    flex: 1,
    gap: 2,
  },
  compactNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  compactName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
  },
  compactDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  compactModel: {
    fontSize: fontSize.xs,
  },
  compactProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  compactProgressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  compactProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  compactPercent: {
    fontSize: fontSize.xs,
    minWidth: 36,
    textAlign: 'right',
  },
  selectionCover: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: borderRadius.xl,
  },
  selectionBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 24,
    height: 24,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  titleArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  printerImageWrap: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  printerImage: {
    width: '100%',
    height: '100%',
    borderRadius: borderRadius.lg,
  },
  titleText: {
    flex: 1,
    gap: 2,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  connectionDot: {
    width: 10,
    height: 10,
    borderRadius: borderRadius.full,
  },
  meta: {
    fontSize: fontSize.sm,
  },
  badgesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  infoPillText: {
    fontSize: 10,
    fontWeight: fontWeight.semibold,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    fontWeight: fontWeight.semibold,
  },
  sectionDivider: {
    flex: 1,
    height: 2,
    borderRadius: borderRadius.full,
  },
  statusRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  previewFrame: {
    width: 108,
    height: 108,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewProgressWrap: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: 0,
  },
  previewProgressTrack: {
    height: 6,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  previewPlaceholder: {
    width: 108,
    height: 108,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewProgressFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  statusContent: {
    flex: 1,
    gap: spacing.sm,
  },
  statusTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  stateText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  refreshText: {
    fontSize: fontSize.xs,
  },
  printName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
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
  progressMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  progressText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  progressMeta: {
    fontSize: fontSize.sm,
  },
  timelineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  timelineItem: {
    fontSize: fontSize.xs,
  },
  userText: {
    fontSize: fontSize.xs,
  },
  controlsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  controlActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  controlButton: {
    minHeight: 38,
    minWidth: 96,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  controlIconButton: {
    width: 42,
    height: 42,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButtonOutline: {
    backgroundColor: 'transparent',
  },
  controlButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metricCard: {
    width: '31%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  metricLabel: {
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricDot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
  },
  metricValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  metricHelper: {
    fontSize: fontSize.xs,
  },
  amsList: {
    gap: spacing.sm,
  },
  amsCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  amsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  amsHeaderText: {
    flex: 1,
    gap: 2,
  },
  amsTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  amsSubtitle: {
    fontSize: fontSize.xs,
  },
  amsIndicators: {
    alignItems: 'flex-end',
    gap: 2,
  },
  amsIndicatorText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  trayGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  trayPressable: {
    flex: 1,
    minWidth: 0,
  },
  trayCard: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    gap: 4,
  },
  trayCardCompact: {
    maxWidth: 140,
  },
  trayTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  trayColorCircle: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trayColorText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  activeDot: {
    width: 10,
    height: 10,
    borderRadius: borderRadius.full,
    marginTop: 2,
  },
  trayLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  traySubtitle: {
    fontSize: 10,
  },
  fillTrack: {
    height: 6,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  fillBar: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  trayFillText: {
    fontSize: fontSize.xs,
  },
  rackRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rackSlot: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rackSlotText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  nozzleMetaList: {
    gap: spacing.xs,
  },
  nozzleMetaText: {
    fontSize: fontSize.xs,
  },
  hmsList: {
    gap: spacing.sm,
  },
  hmsItem: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hmsSeverity: {
    width: 8,
    height: 36,
    borderRadius: borderRadius.full,
  },
  hmsText: {
    flex: 1,
    gap: 2,
  },
  hmsTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  hmsSubtitle: {
    fontSize: fontSize.xs,
  },
  maintenanceList: {
    gap: spacing.sm,
  },
  maintenanceItem: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  maintenanceDot: {
    width: 8,
    height: 32,
    borderRadius: borderRadius.full,
  },
  maintenanceText: {
    flex: 1,
    gap: 2,
  },
  maintenanceTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  maintenanceSubtitle: {
    fontSize: fontSize.xs,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  footerRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerPrintButton: {
    minHeight: 38,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  footerPrintText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  disabledAction: {
    opacity: 0.45,
  },
});
