import { translateNative, useNativeLocale } from '@/i18n';
import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { StatusBadge } from '@/components/common/AppUI';
import { InfoPill } from '@/components/printers/PrinterCardPrimitives';
import { FirmwareBadge } from '@/components/printers/FirmwareBadge';
import { PrinterAiDetectionBadge } from '@/components/printers/PrinterAiDetectionBadge';
import { useTheme } from '@/theme';
import { styles } from '@/components/printers/PrinterCard.styles';
import type { PrinterCardHeaderProps } from '@/components/printers/PrinterCard.types';
import {
  DOOR_SENSOR_MODELS,
  getSeverityColor,
  getWifiTone,
} from '@/components/printers/PrinterCard.helpers';
import {
  AlertCircle,
  CheckCircle,
  Link,
  Layers,
  Printer as PrinterIcon,
  Wifi,
  WifiOff,
  Wrench,
} from 'lucide-react-native';

export function PrinterCardHeader({
  printer,
  status,
  badgeLabel,
  badgeColor,
  hmsErrors,
  queueCount,
  maintenance,
  maintenanceCount,
  printerImageSource,
  onPress,
  onQueuePress,
  onMaintenancePress,
  onShowHmsModal,
  onFirmwarePress,
}: PrinterCardHeaderProps) {
  useNativeLocale();
  const { colors } = useTheme();
  const isConnected = status?.connected ?? false;
  const maintenanceTone = maintenance?.dueCount ? colors.error : colors.warning;
  const hmsTone = getSeverityColor(hmsErrors, colors);

  return (
    <>
      <View style={styles.headerRow}>
        <Pressable onPress={onPress} style={styles.titleArea}>
          <View
            style={[
              styles.printerImageWrap,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.border,
              },
            ]}
          >
            {printerImageSource ? (
              <Image source={printerImageSource} style={styles.printerImage} />
            ) : (
              <PrinterIcon size={18} color={colors.textSecondary} strokeWidth={2} />
            )}
          </View>
          <View style={styles.titleText}>
            <View style={styles.titleLine}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                {printer.name}
              </Text>
              <View
                style={[
                  styles.connectionDot,
                  {
                    backgroundColor: isConnected ? colors.success : colors.error,
                  },
                ]}
              />
            </View>
            <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
              {printer.model || translateNative('native.e292a54ac2d93315')}
              {printer.location ? ` • ${printer.location}` : ''}
            </Text>
          </View>
        </Pressable>
        <StatusBadge label={badgeLabel} color={badgeColor} />
      </View>

      <View style={styles.badgesWrap}>
        <InfoPill
          label={
            printer.is_active === false
              ? translateNative('native.79b153b1ff0696da')
              : isConnected
                ? translateNative('native.f592dbfa89d86eef')
                : translateNative('native.460c8b942025eaac')
          }
          color={
            printer.is_active === false
              ? colors.warning
              : isConnected
                ? colors.success
                : colors.error
          }
          icon={
            printer.is_active === false ? (
              <Wrench size={12} color={colors.warning} strokeWidth={2} />
            ) : isConnected ? (
              <Link size={12} color={colors.success} strokeWidth={2} />
            ) : (
              <WifiOff size={12} color={colors.error} strokeWidth={2} />
            )
          }
        />
        {isConnected ? (
          status?.wired_network ? (
            <InfoPill
              label="LAN"
              color={colors.success}
              icon={<Link size={12} color={colors.success} strokeWidth={2} />}
            />
          ) : status?.wifi_signal != null ? (
            <InfoPill
              label={translateNative('native.ea039d892bb558ca', { value0: String(status.wifi_signal) })}
              color={getWifiTone(status.wifi_signal, colors)}
              icon={
                <Wifi
                  size={12}
                  color={getWifiTone(status.wifi_signal, colors)}
                  strokeWidth={2}
                />
              }
            />
          ) : null
        ) : null}
        {hmsErrors.length ? (
          <InfoPill
            label={translateNative('native.73d5a77480cbbcb9', { value0: String(hmsErrors.length) })}
            color={hmsTone}
            icon={<AlertCircle size={12} color={hmsTone} strokeWidth={2} />}
            onPress={onShowHmsModal}
          />
        ) : (
          <InfoPill
            label={translateNative('native.c685b8240ff0d9da')}
            color={colors.success}
            icon={<CheckCircle size={12} color={colors.success} strokeWidth={2} />}
          />
        )}
        <PrinterAiDetectionBadge printerId={printer.id} printerName={printer.name} />
        {queueCount > 0 ? (
          <InfoPill
            label={translateNative('native.0f14212d98c0282f', { value0: String(queueCount) })}
            color={colors.info}
            icon={<Layers size={12} color={colors.info} strokeWidth={2} />}
            onPress={onQueuePress}
          />
        ) : null}
        {maintenanceCount > 0 ? (
          <InfoPill
            label={translateNative('native.3ef52b7b7dbfca3f', { value0: String(maintenanceCount) })}
            color={maintenanceTone}
            icon={<Wrench size={12} color={maintenanceTone} strokeWidth={2} />}
            onPress={onMaintenancePress}
          />
        ) : (
          <InfoPill
            label={translateNative('native.296e710f9f11f9af')}
            color={colors.success}
            icon={<Wrench size={12} color={colors.success} strokeWidth={2} />}
          />
        )}
        <FirmwareBadge printerId={printer.id} currentVersion={status?.firmware_version} onPress={onFirmwarePress} />
        {status && DOOR_SENSOR_MODELS.has(printer.model ?? '') ? (
          <InfoPill
            label={status.door_open ? translateNative('native.28741f8ec4b8668a') : translateNative('native.f6b609e270a0d46b')}
            color={status.door_open ? colors.warning : colors.success}
          />
        ) : null}
      </View>
    </>
  );
}
