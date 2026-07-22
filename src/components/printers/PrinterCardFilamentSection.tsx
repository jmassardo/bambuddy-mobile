import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '@/theme';
import type { Printer, PrinterStatus, SpoolAssignment } from '@/types/api';
import {
  getAmsStatusLabel,
  getAmsTitle,
  getEffectiveTrayFill,
  getFillColor,
  getTrayGlobalId,
  getTrayLabel,
  getTrayStateLabel,
} from '@/components/printers/PrinterCard.helpers';
import { SectionLabel, TrayCard } from '@/components/printers/PrinterCardPrimitives';
import { styles } from '@/components/printers/PrinterCard.styles';
import type { TrayPressContext } from '@/components/printers/PrinterCard.types';

interface PrinterCardFilamentSectionProps {
  printer: Printer;
  status?: PrinterStatus;
  spoolAssignments?: SpoolAssignment[];
  onTrayPress: (tray: NonNullable<PrinterStatus['ams']>[number]['tray'][number], context: TrayPressContext) => void;
}

export function PrinterCardFilamentSection({
  printer,
  status,
  spoolAssignments,
  onTrayPress,
}: PrinterCardFilamentSectionProps) {
  const { colors } = useTheme();
  const hasSystems = Boolean(status?.ams?.length || status?.vt_tray?.length);

  if (!hasSystems) return null;

  return (
    <>
      <SectionLabel label="Filament systems" />
      <View style={styles.amsList}>
        {(status?.ams ?? []).map(ams => {
          const trayCount = ams.tray.length;
          return (
            <View
              key={ams.id}
              style={[
                styles.amsCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.amsHeader}>
                <View style={styles.amsHeaderText}>
                  <Text style={[styles.amsTitle, { color: colors.text }]}>{getAmsTitle(ams)}</Text>
                  <Text style={[styles.amsSubtitle, { color: colors.textSecondary }]}>
                    {getAmsStatusLabel(ams)}
                  </Text>
                </View>
                <View style={styles.amsIndicators}>
                  {ams.temp != null ? (
                    <Text
                      style={[
                        styles.amsIndicatorText,
                        { color: getFillColor(100 - ams.temp, colors) },
                      ]}
                    >
                      {ams.temp}°C
                    </Text>
                  ) : null}
                  {ams.humidity != null ? (
                    <Text
                      style={[
                        styles.amsIndicatorText,
                        {
                          color:
                            ams.humidity <= 40
                              ? colors.success
                              : ams.humidity <= 60
                                ? colors.warning
                                : colors.error,
                        },
                      ]}
                    >
                      {ams.humidity}% RH
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.trayGrid}>
                {ams.tray.map((tray, index) => {
                  const active = status?.tray_now === getTrayGlobalId(ams.id, tray.id);
                  return (
                    <TrayCard
                      key={`${ams.id}-${tray.id}-${index}`}
                      label={getTrayLabel(tray)}
                      subtitle={
                        tray.tray_sub_brands &&
                        tray.tray_type &&
                        tray.tray_sub_brands !== tray.tray_type
                          ? tray.tray_type
                          : undefined
                      }
                      fill={getEffectiveTrayFill(
                        tray,
                        printer.id,
                        ams.id,
                        index,
                        spoolAssignments,
                      )}
                      colorHex={tray.tray_color}
                      active={active}
                      helper={String(index + 1)}
                      onPress={() =>
                        onTrayPress(tray, {
                          amsId: ams.id,
                          trayId: tray.id,
                          slotIndex: index,
                          isExternal: false,
                          label: String(index + 1),
                          amsLabel: getAmsTitle(ams),
                          temperature: ams.temp,
                        })
                      }
                      compact={trayCount < 4}
                    />
                  );
                })}
              </View>
            </View>
          );
        })}

        {(status?.vt_tray ?? []).length > 0 ? (
          <View
            style={[
              styles.amsCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.amsHeader}>
              <View style={styles.amsHeaderText}>
                <Text style={[styles.amsTitle, { color: colors.text }]}>External</Text>
                <Text style={[styles.amsSubtitle, { color: colors.textSecondary }]}>Virtual tray</Text>
              </View>
            </View>
            <View style={styles.trayGrid}>
              {(status?.vt_tray ?? []).map((tray, index) => {
                const active = status?.tray_now === (tray.id ?? 254);
                const helper =
                  printer.nozzle_count > 1
                    ? (tray.id ?? 254) === 254
                      ? 'L'
                      : 'R'
                    : String(index + 1);
                return (
                  <TrayCard
                    key={`ext-${tray.id ?? index}`}
                    label={tray.tray_sub_brands || getTrayStateLabel(tray)}
                    subtitle={
                      tray.tray_type && tray.tray_sub_brands
                        ? tray.tray_type
                        : 'Virtual tray'
                    }
                    fill={getEffectiveTrayFill(
                      tray,
                      printer.id,
                      255,
                      (tray.id ?? 254) - 254,
                      spoolAssignments,
                    )}
                    colorHex={tray.tray_color}
                    active={active}
                    helper={helper}
                    onPress={() =>
                      onTrayPress(tray, {
                        amsId: 255,
                        trayId: tray.id ?? 254,
                        slotIndex: index,
                        isExternal: true,
                        label: helper,
                        amsLabel: 'External spool',
                        temperature: null,
                      })
                    }
                    compact
                  />
                );
              })}
            </View>
          </View>
        ) : null}
      </View>
    </>
  );
}
