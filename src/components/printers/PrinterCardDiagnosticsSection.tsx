import React, { useMemo } from 'react';
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
  const { colors } = useTheme();
  const neededItems = useMemo(
    () => maintenance?.items.filter(item => item.is_due || item.is_warning) ?? [],
    [maintenance?.items],
  );

  return (
    <>
      {status?.nozzle_rack?.some(slot => slot.id >= 2) ? (
        <>
          <SectionLabel label="Nozzle rack" />
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
                  {slot.wear != null ? ` • wear ${slot.wear}%` : ''}
                </Text>
              ))}
          </View>
        </>
      ) : null}

      {hmsErrors.length > 0 ? (
        <>
          <SectionLabel label="HMS alerts" />
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
                  <Text style={[styles.hmsSubtitle, { color: colors.textSecondary }]}> 
                    Severity {error.severity}
                    {error.actions?.length ? ` • ${error.actions.join(', ')}` : ''}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {neededItems.length > 0 ? (
        <>
          <SectionLabel label="Maintenance needed" />
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
                        ? 'Overdue'
                        : item.interval_type === 'days'
                          ? `${item.days_until_due ?? 0} day${(item.days_until_due ?? 0) === 1 ? '' : 's'} left`
                          : `${Math.round(item.hours_until_due)}h left`}
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
