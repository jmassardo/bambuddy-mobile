import { translateNative, useNativeLocale, useTranslation } from '@/i18n';
import React from 'react';
import { Image, Pressable, Text, type ImageSourcePropType, View } from 'react-native';
import { Printer as PrinterIcon } from 'lucide-react-native';
import { useTheme } from '@/theme';
import type { Printer, PrinterStatus } from '@/types/api';
import { PrimaryButton } from '@/components/common/AppUI';

import { getSeverityColor, PRINT_GREEN } from '@/components/printers/PrinterCard.helpers';
import { filterKnownHMSErrors } from '@/components/printers/hmsErrorCatalog';
import { styles } from '@/components/printers/PrinterCard.styles';

interface PrinterCardCompactProps {
  printer: Printer;
  selected: boolean;
  selectionMode: boolean;
  isConnected: boolean;
  isPrinting: boolean;
  progress: number;
  status?: PrinterStatus;
  canClearPlate?: boolean;
  clearPlatePending?: boolean;
  onClearPlate?: () => void;
  printerImageSource: ImageSourcePropType | null;
  onPress?: () => void;
  onLongPress?: () => void;
}

export function PrinterCardCompact({
  printer,
  selected,
  selectionMode,
  isConnected,
  isPrinting,
  progress,
  status,
  canClearPlate,
  clearPlatePending,
  onClearPlate,
  printerImageSource,
  onPress,
  onLongPress,
}: PrinterCardCompactProps) {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const hmsErrors = filterKnownHMSErrors(status?.hms_errors ?? []);
  const hasError = hmsErrors.length > 0;
  const statusDotColor = !isConnected ? colors.statusOffline : hasError ? getSeverityColor(hmsErrors, colors) : status?.state === 'PAUSE' || status?.awaiting_plate_clear ? colors.warning : isPrinting
    ? PRINT_GREEN
    : isConnected
      ? colors.success
      : colors.error;

  return (
    <View
      style={[
        styles.compactCard,
        {
          backgroundColor: selected ? colors.accentBg : colors.card,
          borderColor: selected ? colors.accent : colors.cardBorder,
        },
      ]}
    >
      <Pressable onPress={onPress} onLongPress={onLongPress} accessibilityRole={selectionMode ? 'checkbox' : 'button'} accessibilityLabel={printer.name} accessibilityState={selectionMode ? { checked: selected } : undefined}>
      <View style={styles.compactHeader}>
        <View
          style={[
            styles.compactImageWrap,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
          ]}
        >
          {printerImageSource ? (
            <Image source={printerImageSource} style={styles.compactImage} />
          ) : (
            <PrinterIcon size={16} color={colors.textSecondary} strokeWidth={2} />
          )}
        </View>
        <View style={styles.compactInfo}>
          <View style={styles.compactNameRow}>
            <Text style={[styles.compactName, { color: colors.text }]} numberOfLines={1}>
              {printer.name}
            </Text>
            <View style={[styles.compactDot, { backgroundColor: statusDotColor }]} />
          </View>
          <Text
            style={[styles.compactModel, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {printer.model ?? translateNative('native.ff12a040d13addb7')}
          </Text>
        </View>
      </View>
      <View style={styles.compactProgressRow}>
        <View style={[styles.compactProgressTrack, { backgroundColor: colors.border }]}> 
          <View
            style={[
              styles.compactProgressFill,
              {
                width: isPrinting ? `${progress}%` : '0%',
                backgroundColor: isPrinting ? PRINT_GREEN : colors.border,
              },
            ]}
          />
        </View>
        <Text style={[styles.compactPercent, { color: colors.textSecondary }]}>
          {isPrinting ? `${progress}%` : '----%'}
        </Text>
      </View>
      <Text style={{ color: statusDotColor }}>{!isConnected ? t('fleet.offline', { defaultValue: 'Offline' }) : hasError ? t('fleet.hmsCount', { defaultValue: '{{count}} HMS alerts', count: hmsErrors.length }) : status?.state === 'PAUSE' ? t('fleet.paused', { defaultValue: 'Paused' }) : status?.awaiting_plate_clear ? t('fleet.dirtyPlate', { defaultValue: 'Plate awaiting clearance' }) : status?.state ?? '—'}</Text>
      {hasError && status?.state === 'PAUSE' ? <Text style={{ color: colors.warning }}>{t('fleet.paused', { defaultValue: 'Paused' })}</Text> : null}
      {status?.awaiting_plate_clear && (hasError || status.state === 'PAUSE') ? <Text style={{ color: colors.warning }}>{t('fleet.dirtyPlate', { defaultValue: 'Plate awaiting clearance' })}</Text> : null}
      {isPrinting ? <Text style={{ color: colors.textSecondary }}>{t('fleet.compactMetrics', { defaultValue: '{{remaining}} min · ETA {{eta}} · Layer {{layer}}/{{total}}', remaining: status?.remaining_time ?? '—', eta: status?.remaining_time == null ? '—' : new Date(Date.now() + status.remaining_time * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), layer: status?.layer_num ?? '—', total: status?.total_layers ?? '—' })}</Text> : null}
      </Pressable>
      {canClearPlate && onClearPlate ? <PrimaryButton label={t('fleet.clearPlate', { defaultValue: 'Mark plate as cleared?' })} onPress={onClearPlate} loading={clearPlatePending} disabled={clearPlatePending} /> : null}
    </View>
  );
}
