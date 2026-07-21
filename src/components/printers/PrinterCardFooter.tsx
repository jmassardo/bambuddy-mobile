import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Camera, FolderOpen, MoreVertical, Play } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { PRINT_GREEN } from '@/components/printers/PrinterCard.helpers';
import { styles } from '@/components/printers/PrinterCard.styles';

interface PrinterCardFooterProps {
  canCamera: boolean;
  canBrowse: boolean;
  onCameraPress?: () => void;
  onPrintPress?: () => void;
  onShowMoreMenu: () => void;
}

export function PrinterCardFooter({
  canCamera,
  canBrowse,
  onCameraPress,
  onPrintPress,
  onShowMoreMenu,
}: PrinterCardFooterProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.footerRow}>
      <View style={styles.footerLeft}>
        <Pressable
          onPress={onShowMoreMenu}
          style={[
            styles.iconButton,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
            },
          ]}
        >
          <MoreVertical size={18} color={colors.text} strokeWidth={2} />
        </Pressable>
      </View>
      <View style={styles.footerRight}>
        <Pressable
          onPress={onCameraPress}
          disabled={!canCamera}
          style={[
            styles.iconButton,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
            },
            !canCamera && styles.disabledAction,
          ]}
        >
          <Camera size={16} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Pressable
          onPress={onPrintPress}
          disabled={!canBrowse}
          style={[
            styles.iconButton,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
            },
            !canBrowse && styles.disabledAction,
          ]}
        >
          <FolderOpen size={16} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Pressable
          onPress={onPrintPress}
          disabled={!canBrowse}
          style={[
            styles.footerPrintButton,
            {
              backgroundColor: PRINT_GREEN,
              borderColor: PRINT_GREEN,
            },
            !canBrowse && styles.disabledAction,
          ]}
        >
          <Play size={14} color={colors.textInverse} strokeWidth={2} />
          <Text style={[styles.footerPrintText, { color: colors.textInverse }]}>Print</Text>
        </Pressable>
      </View>
    </View>
  );
}
