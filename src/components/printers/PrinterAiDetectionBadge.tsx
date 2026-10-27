import React, { useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Eye } from 'lucide-react-native';
import { workflowSettingsApi } from '@/api/workflowSettings';
import { PrimaryButton } from '@/components/common/AppUI';
import { InfoPill } from './PrinterCardPrimitives';
import { SimpleModal, settingsStyles } from '@/components/settings/shared';
import { selectSettingsSearchResult } from '@/components/settings/SettingsSearchFocus';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n';
import { useTheme } from '@/theme';
import { aiDetectionClass, hasAiVerdict } from '@/utils/aiDetection';
import type { RootNavigationProp } from '@/navigation/types';

export function PrinterAiDetectionBadge({
  printerId,
  printerName,
}: {
  printerId: number;
  printerName: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const navigation = useNavigation<RootNavigationProp<'Settings'>>();
  const { authEnabled, hasPermission } = useAuth();
  const status = useQuery({
    queryKey: ['obico-printer-status'],
    queryFn: workflowSettingsApi.getPrinterAiStatus,
    refetchInterval: 10000,
  });
  const [visible, setVisible] = useState(false);
  const detection = status.data?.per_printer[String(printerId)];
  const classification = aiDetectionClass(detection);
  const reason = detection?.error ?? status.data?.last_error;
  const monitored = status.data?.monitored_printers;
  if (
    status.data &&
    (!status.data.enabled ||
      (monitored !== null && !monitored?.includes(printerId)))
  )
    return null;
  if (status.isLoading) return null;
  const label = status.isError
    ? t('workflow.ai.unavailable', { defaultValue: 'AI unavailable' })
    : t(`workflow.ai.${classification}`, {
        defaultValue: `AI ${classification}`,
      });
  const color =
    status.isError || classification === 'error'
      ? colors.warning
      : classification === 'failure'
      ? colors.error
      : classification === 'warning'
      ? colors.warning
      : classification === 'safe'
      ? colors.success
      : colors.textSecondary;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('workflow.ai.openDetail', {
          defaultValue: '{{name}}: {{status}}. Open AI detection details.',
          name: printerName,
          status: label,
        })}
        onPress={() => setVisible(true)}
      >
        <InfoPill
          label={label}
          color={color}
          icon={<Eye size={12} color={color} strokeWidth={2} />}
        />
      </Pressable>
      <SimpleModal
        visible={visible}
        title={t('workflow.ai.detail', {
          defaultValue: 'AI detection: {{name}}',
          name: printerName,
        })}
        onClose={() => setVisible(false)}
      >
        <ScrollView>
          <Text style={[settingsStyles.helper, { color }]}>{label}</Text>
          {hasAiVerdict(detection) ? (
            <Text style={[settingsStyles.helper, { color: colors.text }]}>
              {t('workflow.ai.measurement', {
                defaultValue: 'Score: {{score}} • Frames analyzed: {{frames}}',
                score: detection!.score.toFixed(3),
                frames: detection!.frame_count,
              })}
            </Text>
          ) : (
            <Text
              style={[settingsStyles.helper, { color: colors.textSecondary }]}
            >
              {t('workflow.ai.unmeasured', {
                defaultValue:
                  'No inference is available. This is not a measured safe result.',
              })}
            </Text>
          )}
          {reason || status.error ? (
            <Text
              selectable
              style={[settingsStyles.helper, { color: colors.error }]}
            >
              {reason ?? status.error?.message}
            </Text>
          ) : null}
          <PrimaryButton
            label={t('common.refresh', { defaultValue: 'Refresh' })}
            variant="secondary"
            onPress={() => void status.refetch()}
            loading={status.isFetching}
          />
          {!authEnabled || hasPermission('settings:read') ? (
            <PrimaryButton
              label={t('workflow.ai.settings', {
                defaultValue: 'Open failure detection settings',
              })}
              onPress={() => {
                setVisible(false);
                selectSettingsSearchResult({
                  section: 'failure-detection',
                  label: 'Failure detection enabled',
                });
                navigation.navigate('Settings');
              }}
            />
          ) : null}
        </ScrollView>
      </SimpleModal>
    </>
  );
}
