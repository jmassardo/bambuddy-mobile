import { translateNative, useNativeLocale } from '@/i18n';

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
  useNativeLocale();
  const { colors } = useTheme();

  return (
    <>
      <SectionLabel label={translateNative('native.77c2c7a7b6b18f89')} />
      <View style={styles.metricGrid}>
        <MetricCard
          label={status?.temperatures?.nozzle_2 != null ? translateNative('native.d64d89f8b46fc1b6') : translateNative('native.13db537aa9385363')}
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
              ? translateNative('native.c24d23a879d2497c', { value0: String(status.active_extruder === 1 ? translateNative('native.a77c6e49d493726f') : translateNative('native.c553cf4b7f712428')) })
              : status?.nozzles?.[0]?.nozzle_diameter
                ? translateNative('native.66f0ea9f96852e2f', { value0: String(status.nozzles[0].nozzle_diameter), value1: String(status.nozzles[0].nozzle_type.replace(/_/g, ' ')) })
                : undefined
          }
          tone={temperatureTone(
            status?.temperatures?.nozzle,
            status?.temperatures?.nozzle_target,
            colors,
          )}
        />
        <MetricCard
          label={translateNative('native.a3619e5a7b86c9e4', { defaultValue: 'Bed' })}
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
            label={translateNative('native.3240e2f71b00c6f4')}
            value={formatTemperature(
              status?.temperatures?.chamber,
              status?.temperatures?.chamber_target,
            )}
            helper={status.supports_chamber_heater ? translateNative('native.922e4e79f3b0da48') : translateNative('native.8e8f6ac4eb331489')}
            tone={temperatureTone(
              status?.temperatures?.chamber,
              status?.temperatures?.chamber_target,
              colors,
            )}
          />
        ) : null}
        <MetricCard
          label={translateNative('native.2717fca8a03cf1af')}
          value={`${status?.cooling_fan_speed ?? 0}%`}
          tone={(status?.cooling_fan_speed ?? 0) > 0 ? colors.info : colors.textTertiary}
        />
        <MetricCard
          label={translateNative('native.cae602d2fafe533b')}
          value={`${status?.big_fan1_speed ?? 0}%`}
          tone={(status?.big_fan1_speed ?? 0) > 0 ? colors.info : colors.textTertiary}
        />
        {CHAMBER_FAN_MODELS.has(printer.model ?? '') ? (
          <MetricCard
            label={translateNative('native.390965957fc71204')}
            value={`${status?.big_fan2_speed ?? 0}%`}
            tone={(status?.big_fan2_speed ?? 0) > 0 ? colors.success : colors.textTertiary}
          />
        ) : null}
      </View>
    </>
  );
}
