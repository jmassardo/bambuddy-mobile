import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import type { Printer, PrinterStatus } from '@/types/api';
import { CHAMBER_FAN_MODELS, formatDualNozzleTemperature, formatTemperature, temperatureTone } from '@/components/printers/PrinterCard.helpers';
import { MetricCard, SectionLabel } from '@/components/printers/PrinterCardPrimitives';
import { styles } from '@/components/printers/PrinterCard.styles';

interface PrinterCardTemperatureSectionProps {
  printer: Printer;
  status?: PrinterStatus;
}

export function PrinterCardTemperatureSection({
  printer,
  status,
}: PrinterCardTemperatureSectionProps) {
  const { colors } = useTheme();

  return (
    <>
      <SectionLabel label="Temperatures & fans" />
      <View style={styles.metricGrid}>
        <MetricCard
          label={status?.temperatures?.nozzle_2 != null ? 'Nozzles' : 'Nozzle'}
          value={
            status?.temperatures?.nozzle_2 != null && status
              ? formatDualNozzleTemperature(status)
              : formatTemperature(
                  status?.temperatures?.nozzle,
                  status?.temperatures?.nozzle_target,
                )
          }
          helper={
            status?.active_extruder != null && status?.temperatures?.nozzle_2 != null
              ? `Active ${status.active_extruder === 1 ? 'left' : 'right'} nozzle`
              : status?.nozzles?.[0]?.nozzle_diameter
                ? `${status.nozzles[0].nozzle_diameter}mm ${status.nozzles[0].nozzle_type.replace(/_/g, ' ')}`
                : undefined
          }
          tone={temperatureTone(
            status?.temperatures?.nozzle,
            status?.temperatures?.nozzle_target,
            colors,
          )}
        />
        <MetricCard
          label="Bed"
          value={formatTemperature(
            status?.temperatures?.bed,
            status?.temperatures?.bed_target,
          )}
          tone={temperatureTone(
            status?.temperatures?.bed,
            status?.temperatures?.bed_target,
            colors,
          )}
        />
        {status?.temperatures?.chamber != null ? (
          <MetricCard
            label="Chamber"
            value={formatTemperature(
              status?.temperatures?.chamber,
              status?.temperatures?.chamber_target,
            )}
            helper={status.supports_chamber_heater ? 'Heated chamber' : 'Sensor only'}
            tone={temperatureTone(
              status?.temperatures?.chamber,
              status?.temperatures?.chamber_target,
              colors,
            )}
          />
        ) : null}
        <MetricCard
          label="Part fan"
          value={`${status?.cooling_fan_speed ?? 0}%`}
          tone={(status?.cooling_fan_speed ?? 0) > 0 ? colors.info : colors.textTertiary}
        />
        <MetricCard
          label="Aux fan"
          value={`${status?.big_fan1_speed ?? 0}%`}
          tone={(status?.big_fan1_speed ?? 0) > 0 ? colors.info : colors.textTertiary}
        />
        {CHAMBER_FAN_MODELS.has(printer.model ?? '') ? (
          <MetricCard
            label="Chamber fan"
            value={`${status?.big_fan2_speed ?? 0}%`}
            tone={(status?.big_fan2_speed ?? 0) > 0 ? colors.success : colors.textTertiary}
          />
        ) : null}
      </View>
    </>
  );
}
