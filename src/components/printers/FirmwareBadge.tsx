import { useNativeLocale, useTranslation } from '@/i18n';
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { printerFleetApi } from '@/api/printerFleet';
import { InfoPill } from './PrinterCardPrimitives';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/theme';

export function FirmwareBadge({
  printerId,
  currentVersion,
  onPress,
}: {
  printerId: number;
  currentVersion?: string | null;
  onPress?: () => void;
}) {
  useNativeLocale();
  const { hasPermission } = useAuth();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const firmware = useQuery({
    queryKey: ['firmwareUpdate', printerId],
    queryFn: () => printerFleetApi.firmware(printerId),
    enabled: hasPermission('firmware:read'),
    staleTime: 300000,
  });
  if (!currentVersion && !firmware.data) return null;
  return (
    <InfoPill
      label={
        firmware.data?.update_available
          ? t('fleet.firmwareAvailable', {
              defaultValue: '{{current}} → {{latest}}',
              current: currentVersion ?? '—',
              latest: firmware.data.latest_version ?? '—',
            })
          : currentVersion || firmware.data?.current_version || '—'
      }
      color={
        firmware.data?.update_available ? colors.warning : colors.textSecondary
      }
      onPress={onPress}
    />
  );
}
