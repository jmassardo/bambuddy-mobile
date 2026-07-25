import React from 'react';
import { Image, Text, type ImageSourcePropType, View } from 'react-native';
import { Box } from 'lucide-react-native';
import { useTheme } from '@/theme';
import type { PrinterStatus } from '@/types/api';
import {
  formatEta,
  PRINT_GREEN,
} from '@/components/printers/PrinterCard.helpers';
import { SectionLabel } from '@/components/printers/PrinterCardPrimitives';
import { styles } from '@/components/printers/PrinterCard.styles';
import { formatDuration } from '@/utils/data';

interface PrinterCardStatusSectionProps {
  status?: PrinterStatus;
  badgeLabel: string;
  badgeColor: string;
  currentPrintName: string;
  progress: number;
  elapsedSeconds: number | null;
  speedInfo: { label: string; percent: string };
  loading: boolean;
  isPrinting: boolean;
  currentPrintUserName?: string | null;
  partPreviewSource: ImageSourcePropType | null;
}

export function PrinterCardStatusSection({
  status,
  badgeLabel,
  badgeColor,
  currentPrintName,
  progress,
  elapsedSeconds,
  speedInfo,
  loading,
  isPrinting,
  currentPrintUserName,
  partPreviewSource,
}: PrinterCardStatusSectionProps) {
  const { colors } = useTheme();

  return (
    <>
      <SectionLabel label="Status" />
      <View style={styles.statusRow}>
        <View
          style={[
            styles.previewFrame,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
            },
          ]}
        >
          {partPreviewSource ? (
            <Image source={partPreviewSource} style={styles.previewImage} resizeMode="cover" />
          ) : (
            <View style={styles.previewPlaceholder}>
              <Box size={32} color={colors.textTertiary} strokeWidth={1.5} />
            </View>
          )}
          {isPrinting ? (
            <View style={styles.previewProgressWrap}>
              <View
                style={[
                  styles.previewProgressTrack,
                  { backgroundColor: 'rgba(0, 0, 0, 0.5)' },
                ]}
              >
                <View
                  style={[
                    styles.previewProgressFill,
                    { width: `${progress}%`, backgroundColor: PRINT_GREEN },
                  ]}
                />
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.statusContent}>
          <View style={styles.statusTopRow}>
            <Text style={[styles.stateText, { color: colors.textSecondary }]} numberOfLines={1}>
              {badgeLabel}
            </Text>
            {loading ? (
              <Text style={[styles.refreshText, { color: colors.textTertiary }]}>Refreshing…</Text>
            ) : null}
          </View>
          <Text style={[styles.printName, { color: colors.text }]} numberOfLines={2}>
            {currentPrintName}
          </Text>
          <View style={[styles.progressTrack, { backgroundColor: colors.surfaceHover }]}> 
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progress}%`,
                  backgroundColor: badgeColor,
                },
              ]}
            />
          </View>
          <View style={styles.progressMetaRow}>
            <Text style={[styles.progressText, { color: colors.text }]}>{`${Math.round(progress)}%`}</Text>
            <Text style={[styles.progressMeta, { color: colors.textSecondary }]}> 
              Layer{' '}
              {status?.layer_num != null && status?.total_layers != null
                ? `${status.layer_num}/${status.total_layers}`
                : '—'}
            </Text>
          </View>
          <View style={styles.timelineRow}>
            <Text style={[styles.timelineItem, { color: colors.textSecondary }]}>
              Remaining {formatDuration((status?.remaining_time ?? 0) * 60)}
            </Text>
            <Text style={[styles.timelineItem, { color: colors.textSecondary }]}>
              Elapsed {formatDuration(elapsedSeconds ?? 0)}
            </Text>
          </View>
          <View style={styles.timelineRow}>
            <Text style={[styles.timelineItem, { color: colors.textSecondary }]}>
              ETA {formatEta(status?.remaining_time)}
            </Text>
            <Text style={[styles.timelineItem, { color: colors.textSecondary }]}>
              Speed {speedInfo.label} · {speedInfo.percent}
            </Text>
          </View>
          {currentPrintUserName ? (
            <Text style={[styles.userText, { color: colors.textTertiary }]} numberOfLines={1}>
              Started by {currentPrintUserName}
            </Text>
          ) : null}
        </View>
      </View>
    </>
  );
}
