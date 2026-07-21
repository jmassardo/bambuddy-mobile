import React from 'react';
import { Gauge, Layers, Lightbulb, Move, Pause, Play, RefreshCw, RotateCcw, Square, Wrench } from 'lucide-react-native';
import { useTheme } from '@/theme';
import type { PrinterStatus } from '@/types/api';
import {
  PAUSE_AMBER,
  PRINT_GREEN,
  STOP_RED,
} from '@/components/printers/PrinterCard.helpers';
import { ControlButton, SectionLabel } from '@/components/printers/PrinterCardPrimitives';
import { styles } from '@/components/printers/PrinterCard.styles';
import { View } from 'react-native';

interface PrinterCardControlsSectionProps {
  status?: PrinterStatus;
  canControlPrinter: boolean;
  canPrintControl: boolean;
  canClearPlate: boolean;
  canSkipObjects: boolean;
  isPaused: boolean;
  isPrintingWithObjects: boolean;
  speedInfo: { label: string; percent: string };
  actionPending: boolean;
  lightPending: boolean;
  speedPending: boolean;
  clearPlatePending: boolean;
  onToggleLight: () => void;
  onShowMoveMenu: () => void;
  onShowCalibrateMenu: () => void;
  onShowSpeedMenu: () => void;
  onRefresh: () => void;
  onShowSkipObjects: () => void;
  onTogglePause: () => void;
  onStop: () => void;
  onClearPlate: () => void;
}

export function PrinterCardControlsSection({
  status,
  canControlPrinter,
  canPrintControl,
  canClearPlate,
  canSkipObjects,
  isPaused,
  isPrintingWithObjects,
  speedInfo,
  actionPending,
  lightPending,
  speedPending,
  clearPlatePending,
  onToggleLight,
  onShowMoveMenu,
  onShowCalibrateMenu,
  onShowSpeedMenu,
  onRefresh,
  onShowSkipObjects,
  onTogglePause,
  onStop,
  onClearPlate,
}: PrinterCardControlsSectionProps) {
  const { colors } = useTheme();

  return (
    <>
      <SectionLabel label="Controls" />
      <View style={styles.controlsGrid}>
        <ControlButton
          label={status?.chamber_light ? 'Light on' : 'Light off'}
          icon={
            <Lightbulb
              size={16}
              color={status?.chamber_light ? colors.warning : colors.text}
              strokeWidth={2}
            />
          }
          onPress={onToggleLight}
          disabled={!canControlPrinter || lightPending}
          backgroundColor={colors.surfaceElevated}
          borderColor={colors.border}
          textColor={colors.text}
          iconOnly
        />
        <ControlButton
          label="Move"
          icon={<Move size={16} color={colors.text} strokeWidth={2} />}
          onPress={onShowMoveMenu}
          disabled={!canControlPrinter}
          backgroundColor={colors.surfaceElevated}
          borderColor={colors.border}
          textColor={colors.text}
          iconOnly
        />
        <ControlButton
          label="Calibrate"
          icon={<RotateCcw size={16} color={colors.text} strokeWidth={2} />}
          onPress={onShowCalibrateMenu}
          disabled={!canControlPrinter}
          backgroundColor={colors.surfaceElevated}
          borderColor={colors.border}
          textColor={colors.text}
          iconOnly
        />
        <ControlButton
          label={speedInfo.label}
          icon={<Gauge size={16} color={colors.text} strokeWidth={2} />}
          onPress={onShowSpeedMenu}
          disabled={!canControlPrinter || speedPending}
          backgroundColor={colors.surfaceElevated}
          borderColor={colors.border}
          textColor={colors.text}
          iconOnly
        />
        <ControlButton
          label="Refresh"
          icon={<RefreshCw size={16} color={colors.text} strokeWidth={2} />}
          onPress={onRefresh}
          backgroundColor={colors.surfaceElevated}
          borderColor={colors.border}
          textColor={colors.text}
          iconOnly
        />
        {isPrintingWithObjects ? (
          <ControlButton
            label="Skip objects"
            icon={<Layers size={16} color={colors.text} strokeWidth={2} />}
            onPress={onShowSkipObjects}
            disabled={!canSkipObjects}
            backgroundColor={colors.surfaceElevated}
            borderColor={colors.border}
            textColor={colors.text}
            iconOnly
          />
        ) : null}
      </View>
      <View style={styles.controlActionsRow}>
        <ControlButton
          label={isPaused ? 'Resume' : 'Pause'}
          icon={
            isPaused ? (
              <Play size={16} color={colors.textInverse} strokeWidth={2} />
            ) : (
              <Pause size={16} color={colors.textInverse} strokeWidth={2} />
            )
          }
          onPress={onTogglePause}
          disabled={!canPrintControl || actionPending}
          backgroundColor={isPaused ? PRINT_GREEN : PAUSE_AMBER}
          borderColor={isPaused ? PRINT_GREEN : PAUSE_AMBER}
          textColor={colors.textInverse}
          iconOnly
        />
        <ControlButton
          label="Stop"
          icon={<Square size={16} color={colors.textInverse} strokeWidth={2} />}
          onPress={onStop}
          disabled={!canPrintControl || actionPending}
          backgroundColor={STOP_RED}
          borderColor={STOP_RED}
          textColor={colors.textInverse}
          iconOnly
        />
        {status?.awaiting_plate_clear ? (
          <ControlButton
            label="Clear plate"
            icon={<Wrench size={15} color={PAUSE_AMBER} strokeWidth={2} />}
            onPress={onClearPlate}
            disabled={!canClearPlate || clearPlatePending}
            backgroundColor="transparent"
            borderColor={PAUSE_AMBER}
            textColor={PAUSE_AMBER}
            outline
          />
        ) : null}
      </View>
    </>
  );
}
