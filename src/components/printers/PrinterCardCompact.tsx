import React from 'react';
import { Image, Pressable, Text, type ImageSourcePropType, View } from 'react-native';
import { Printer as PrinterIcon } from 'lucide-react-native';
import { useTheme } from '@/theme';
import type { Printer } from '@/types/api';
import { PRINT_GREEN } from '@/components/printers/PrinterCard.helpers';
import { styles } from '@/components/printers/PrinterCard.styles';

interface PrinterCardCompactProps {
  printer: Printer;
  selected: boolean;
  isConnected: boolean;
  isPrinting: boolean;
  progress: number;
  printerImageSource: ImageSourcePropType | null;
  onPress?: () => void;
  onLongPress?: () => void;
}

export function PrinterCardCompact({
  printer,
  selected,
  isConnected,
  isPrinting,
  progress,
  printerImageSource,
  onPress,
  onLongPress,
}: PrinterCardCompactProps) {
  const { colors } = useTheme();
  const statusDotColor = isPrinting
    ? PRINT_GREEN
    : isConnected
      ? colors.success
      : colors.error;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        styles.compactCard,
        {
          backgroundColor: selected ? colors.accentBg : colors.card,
          borderColor: selected ? colors.accent : colors.cardBorder,
        },
      ]}
    >
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
            {printer.model ?? 'Unknown'}
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
    </Pressable>
  );
}
