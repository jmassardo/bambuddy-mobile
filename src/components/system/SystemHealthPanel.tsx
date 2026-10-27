import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/common/AppUI';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import type { SystemHealthResult } from '@/types/api';
import { useTranslation } from '@/i18n';

const remedies: Record<string, { name: string; cause: string; fix: string }> = {
  'ftp-auth-rejected': {
    name: 'Printer file-transfer authentication rejected',
    cause: 'The printer rejected the access code.',
    fix: 'Verify the LAN access code in printer settings and update the saved printer credentials.',
  },
  'ftp-connection-timeout': {
    name: 'Printer file transfer repeatedly times out',
    cause: 'The printer or its FTPS port may be unreachable.',
    fix: 'Check the printer address, power and network routing. Allow TCP port 990 from the server.',
  },
  'ftp-ssl-error': {
    name: 'Printer file-transfer TLS failures',
    cause: 'The printer file service is responding without completing TLS.',
    fix: 'Restart the printer to recover its file service. Until it recovers, print files, covers and timelapses cannot be retrieved.',
  },
  'mqtt-connection-flapping': {
    name: 'Unstable printer connection',
    cause: 'MQTT connections are repeatedly reconnecting.',
    fix: 'Check LAN mode, Wi-Fi stability and routing; allow TCP port 8883 from the server.',
  },
  'camera-connection-refused': {
    name: 'Printer camera is unreachable',
    cause: 'The camera connection is refused or times out.',
    fix: 'Enable the camera and LAN liveview. Check routing and TCP port 322 on supported printers.',
  },
  'bambu-cloud-captcha': {
    name: 'Bambu Cloud network challenge',
    cause: 'Bambu Cloud is challenging the server network with a CAPTCHA.',
    fix: 'Try a different trusted network or wait before retrying. Changing credentials will not resolve this network challenge.',
  },
  'database-locked': {
    name: 'Database write contention',
    cause: 'Concurrent writes are locking the SQLite database.',
    fix: 'Consider migrating to PostgreSQL for multi-printer workloads. See the migration guidance before changing the database.',
  },
};

export function SystemHealthPanel({ result }: { result: SystemHealthResult }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  if (!result.log_available)
    return (
      <Text style={{ color: colors.textSecondary }}>
        {t('system.health.unavailable', {
          defaultValue:
            'Application logs are unavailable; health could not be assessed.',
        })}
      </Text>
    );
  if (!result.findings.length)
    return (
      <Text style={{ color: colors.text }}>
        {t('system.health.clean', {
          defaultValue: 'No known problems found in {{count}} scanned records.',
          count: result.scanned_entries,
        })}
      </Text>
    );
  return (
    <View style={styles.list}>
      {result.findings.map(finding => {
        const remedy = remedies[finding.signature_id];
        return (
          <View key={finding.signature_id} style={styles.finding}>
            <Text
              style={{
                color:
                  finding.severity === 'error' ? colors.error : colors.text,
              }}
            >
              {t(`system.health.${finding.signature_id}.name`, {
                defaultValue: remedy?.name ?? finding.signature_id,
              })}{' '}
              · {finding.severity} · {finding.category}
            </Text>
            {remedy ? (
              <>
                <Text style={{ color: colors.textSecondary }}>
                  {t(`system.health.${finding.signature_id}.cause`, {
                    defaultValue: remedy.cause,
                  })}
                </Text>
                <Text style={{ color: colors.text }}>
                  {t(`system.health.${finding.signature_id}.fix`, {
                    defaultValue: remedy.fix,
                  })}
                </Text>
              </>
            ) : null}
            <Text selectable style={{ color: colors.textSecondary }}>
              {finding.sample}
            </Text>
            <Text style={{ color: colors.textSecondary }}>
              {t('system.health.occurrences', {
                defaultValue:
                  '{{count}} occurrences · first {{first}} · last {{last}}',
                count: finding.count,
                first: finding.first_seen,
                last: finding.last_seen,
              })}
            </Text>
            <PrimaryButton
              label={t('system.health.troubleshoot', {
                defaultValue: 'Troubleshooting guidance',
              })}
              variant="secondary"
              onPress={() => {
                void Linking.openURL(
                  `https://wiki.bambuddy.cool/reference/troubleshooting/#${encodeURIComponent(
                    finding.wiki_anchor,
                  )}`,
                );
              }}
            />
          </View>
        );
      })}
    </View>
  );
}
const styles = StyleSheet.create({
  list: { gap: spacing.lg },
  finding: { gap: spacing.sm },
});
