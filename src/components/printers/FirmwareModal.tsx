import { useNativeLocale, useTranslation } from '@/i18n';
import React, { useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { printerFleetApi } from '@/api/printerFleet';
import { PrimaryButton } from '@/components/common/AppUI';
import { FleetModal } from './FleetModal';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/theme';

export function FirmwareModal({
  printerId,
  onClose,
}: {
  printerId: number;
  onClose: () => void;
}) {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canRead = hasPermission('firmware:read');
  const canUpdate = hasPermission('firmware:update');
  const [version, setVersion] = useState('');
  const [polling, setPolling] = useState(false);
  const info = useQuery({
    queryKey: ['firmwareUpdate', printerId],
    queryFn: () => printerFleetApi.firmware(printerId),
    enabled: canRead,
  });
  useEffect(() => {
    if (!version && info.data?.update_available && info.data.latest_version)
      setVersion(info.data.latest_version);
  }, [info.data, version]);
  const prepare = useQuery({
    queryKey: ['firmwarePrepare', printerId, version],
    queryFn: () => printerFleetApi.prepareFirmware(printerId, version),
    enabled: canUpdate && !!version && !polling,
  });
  const status = useQuery({
    queryKey: ['firmwareUpload', printerId],
    queryFn: () => printerFleetApi.firmwareStatus(printerId),
    enabled: canRead,
    refetchInterval: polling ? 1000 : false,
  });
  useEffect(() => {
    const state = status.data?.status;
    if (state === 'complete' || state === 'error') setPolling(false);
    else if (
      state === 'preparing' ||
      state === 'downloading' ||
      state === 'uploading'
    )
      setPolling(true);
  }, [status.data]);
  const upload = useMutation({
    mutationFn: () => printerFleetApi.uploadFirmware(printerId, version),
    onSuccess: result => {
      if (!result.started) throw new Error(result.message);
      setPolling(true);
      void status.refetch();
    },
  });
  const selected = info.data?.available_versions.find(
    entry => entry.version === version,
  );
  const error = info.error || prepare.error || status.error || upload.error;
  return (
    <FleetModal
      title={t('fleet.firmware', { defaultValue: 'Printer firmware' })}
      onClose={onClose}
    >
      {!canRead ? (
        <Text style={{ color: colors.error }}>
          {t('fleet.firmwareDenied', {
            defaultValue: 'Firmware read permission required.',
          })}
        </Text>
      ) : null}
      {info.isLoading ? (
        <Text style={{ color: colors.text }}>
          {t('common.loading', { defaultValue: 'Loading…' })}
        </Text>
      ) : null}
      <Text style={{ color: colors.text }}>
        {t('fleet.versions', {
          defaultValue: 'Current: {{current}} · Latest: {{latest}}',
          current: info.data?.current_version ?? '—',
          latest: info.data?.latest_version ?? '—',
        })}
      </Text>
      <Text style={{ color: colors.text }}>
        {info.data?.update_available
          ? t('fleet.updateAvailable', { defaultValue: 'Update available' })
          : t('fleet.upToDate', {
              defaultValue: 'No newer firmware available',
            })}
      </Text>
      {info.data?.available_versions.map(entry => (
        <PrimaryButton
          key={entry.version}
          label={`${entry.version} · ${
            entry.version === info.data?.current_version
              ? t('fleet.installed', { defaultValue: 'Installed' })
              : entry.file_available
              ? t('fleet.available', { defaultValue: 'Available' })
              : t('fleet.unavailable', { defaultValue: 'Unavailable' })
          }`}
          variant={version === entry.version ? 'primary' : 'secondary'}
          disabled={
            !canUpdate ||
            !entry.file_available ||
            entry.version === info.data?.current_version ||
            polling ||
            upload.isPending
          }
          onPress={() => setVersion(entry.version)}
        />
      ))}
      <Text selectable style={{ color: colors.textSecondary }}>
        {selected?.release_notes ||
          info.data?.release_notes ||
          t('fleet.noNotes', { defaultValue: 'No release notes available.' })}
      </Text>
      {prepare.data ? (
        <>
          <Text style={{ color: colors.text }}>
            {t('fleet.sdPrerequisites', {
              defaultValue:
                'SD card: {{present}} · Free: {{free}} MB · Required: {{required}} MB',
              present: prepare.data.sd_card_present ? '✓' : '✕',
              free:
                prepare.data.sd_card_free_space < 0
                  ? t('fleet.unknown', { defaultValue: 'Unknown' })
                  : Math.round(prepare.data.sd_card_free_space / 1048576),
              required: Math.ceil(prepare.data.firmware_size / 1048576),
            })}
          </Text>
          {prepare.data.errors.map(message => (
            <Text key={message} style={{ color: colors.error }}>
              {message}
            </Text>
          ))}
        </>
      ) : null}
      {status.data && status.data.status !== 'idle' ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: status.data.error ? colors.error : colors.text }}
        >{`${status.data.status}: ${status.data.progress}% — ${
          status.data.error || status.data.message
        }`}</Text>
      ) : null}
      {status.data?.firmware_filename ? (
        <Text selectable style={{ color: colors.text }}>
          {t('fleet.firmwareFile', {
            defaultValue: 'SD file: {{filename}}',
            filename: status.data.firmware_filename,
          })}
        </Text>
      ) : null}
      {error ? (
        <>
          <Text style={{ color: colors.error }}>{error.message}</Text>
          <PrimaryButton
            label={t('common.retry', { defaultValue: 'Retry' })}
            variant="secondary"
            onPress={() => {
              void info.refetch();
              if (version) void prepare.refetch();
              void status.refetch();
            }}
          />
        </>
      ) : null}
      <Text style={{ color: colors.textSecondary }}>
        {t('fleet.firmwareInstructions', {
          defaultValue:
            'Uploading does not install firmware. After upload, on the printer go to Settings → Firmware and select the file on the SD card to apply it. Do not power off during installation.',
        })}
      </Text>
      <PrimaryButton
        label={
          polling
            ? t('fleet.uploading', { defaultValue: 'Uploading…' })
            : t('fleet.uploadFirmware', {
                defaultValue: 'Upload firmware to SD card',
              })
        }
        disabled={
          !canUpdate ||
          !version ||
          !selected?.file_available ||
          !prepare.data?.can_proceed ||
          prepare.isFetching ||
          polling ||
          upload.isPending
        }
        loading={upload.isPending || polling}
        onPress={() =>
          Alert.alert(
            t('fleet.firmware', { defaultValue: 'Printer firmware' }),
            t('fleet.confirmUpload', {
              defaultValue: 'Upload {{version}} to the printer SD card?',
              version,
            }),
            [
              {
                text: t('common.cancel', { defaultValue: 'Cancel' }),
                style: 'cancel',
              },
              {
                text: t('common.confirm', { defaultValue: 'Confirm' }),
                onPress: () => upload.mutate(),
              },
            ],
          )
        }
      />
    </FleetModal>
  );
}
