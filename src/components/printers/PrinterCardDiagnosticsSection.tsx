import { NativeTranslation, nativeEnglishSuffix, translateNative, useLocalizedMemo, useNativeLocale } from '@/i18n';

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { CheckCircle } from 'lucide-react-native';
import { useTheme } from '@/theme';
import type { HMSError, MaintenanceStatus, PrinterStatus } from '@/types/api';
import { getNozzleName } from '@/components/printers/PrinterCard.helpers';
import { NozzleRackView, SectionLabel } from '@/components/printers/PrinterCardPrimitives';
import { styles } from '@/components/printers/PrinterCard.styles';
import type { MaintenanceSummary } from '@/components/printers/PrinterCard.types';

interface PrinterCardDiagnosticsSectionProps {
  status?: PrinterStatus;
  hmsErrors: HMSError[];
  maintenance?: MaintenanceSummary;
  onSelectMaintenanceItem: (item: MaintenanceStatus) => void;
}

export function PrinterCardDiagnosticsSection({
  status,
  hmsErrors,
  maintenance,
  onSelectMaintenanceItem,
}: PrinterCardDiagnosticsSectionProps) {
  useNativeLocale();
  const { colors } = useTheme();
  const neededItems = useLocalizedMemo(
    () => maintenance?.items.filter(item => item.is_due || item.is_warning) ?? [],
    [maintenance?.items],
  );

  return (
    <>
      {status?.nozzle_rack?.some(slot => slot.id >= 2) ? (
        <>
          <SectionLabel label={translateNative('native.86b1a75607230fe6')} />
          <NozzleRackView
            slots={status.nozzle_rack}
            activeNozzle={status.active_extruder}
          />
          <View style={styles.nozzleMetaList}>
            {status.nozzle_rack
              .filter(slot => slot.id >= 2)
              .slice(0, 3)
              .map(slot => (
                <Text
                  key={`meta-${slot.id}`}
                  style={[styles.nozzleMetaText, { color: colors.textSecondary }]}
                >
                  {getNozzleName(slot)}
                  {slot.filament_type ? ` • ${slot.filament_type}` : ''}
                  {slot.wear != null ? translateNative('native.dd43c4b7066fa64c', { value0: String(slot.wear) }) : ''}
                </Text>
              ))}
          </View>
        </>
      ) : null}

      {hmsErrors.length > 0 ? (
        <>
          <SectionLabel label={translateNative('native.b77ee788eecd40d7')} />
          <View style={styles.hmsList}>
            {hmsErrors.slice(0, 3).map((error, index) => (
              <View
                key={`${error.code}-${index}`}
                style={[
                  styles.hmsItem,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.hmsSeverity,
                    {
                      backgroundColor:
                        error.severity <= 2 ? colors.error : colors.warning,
                    },
                  ]}
                />
                <View style={styles.hmsText}>
                  <Text style={[styles.hmsTitle, { color: colors.text }]}>
                    {error.full_code || error.code}
                  </Text>
                  <Text style={[styles.hmsSubtitle, { color: colors.textSecondary }]}><NativeTranslation id="native.9f12920ef0e1958e" values={{ value0: (error.severity), value1: (error.actions?.length ? ` • ${error.actions.join(', ')}` : '') }} /></Text>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {neededItems.length > 0 ? (
        <>
          <SectionLabel label={translateNative('native.5d008e1c6944ece0')} />
          <View style={styles.maintenanceList}>
            {neededItems.slice(0, 5).map(item => {
              const tone = item.is_due ? colors.error : colors.warning;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => onSelectMaintenanceItem(item)}
                  style={[
                    styles.maintenanceItem,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={[styles.maintenanceDot, { backgroundColor: tone }]} />
                  <View style={styles.maintenanceText}>
                    <Text style={[styles.maintenanceTitle, { color: colors.text }]}> 
                      {item.maintenance_type_name}
                    </Text>
                    <Text
                      style={[
                        styles.maintenanceSubtitle,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {item.is_due
                        ? translateNative('native.817a5260361c7a60')
                        : item.interval_type === 'days'
                          ? translateNative('native.7fb5aacbb39c0a53', { value0: String(item.days_until_due ?? 0), value1: String(nativeEnglishSuffix((item.days_until_due ?? 0) === 1 ? '' : 's')) })
                          : translateNative('native.9151531b4eedd411', { value0: String(Math.round(item.hours_until_due)) })}
                    </Text>
                  </View>
                  <CheckCircle size={16} color={colors.textTertiary} strokeWidth={1.5} />
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}
    </>
  );
}
