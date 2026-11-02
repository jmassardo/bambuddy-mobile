import { translateNative, useNativeLocale, useTranslation } from '@/i18n';

import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/common/AppUI';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import type { SystemHealthResult } from '@/types/api';

const remedies: Record<string, { name: string; cause: string; fix: string }> = {
  'ftp-auth-rejected': {
    get name() { return translateNative('native.7dd5084a07705ae7'); },
    get cause() { return translateNative('native.79cf53cf8c9a9b94'); },
    get fix() { return translateNative('native.6541b7808095908e'); },
  },
  'ftp-connection-timeout': {
    get name() { return translateNative('native.63b6061516fa08c5'); },
    get cause() { return translateNative('native.8b0f68530b4e4d3b'); },
    get fix() { return translateNative('native.c6c13f562cf18894'); },
  },
  'ftp-ssl-error': {
    get name() { return translateNative('native.7bd5ecbb1ff8da88'); },
    get cause() { return translateNative('native.0da445708b1a4e2c'); },
    get fix() { return translateNative('native.6516fd100eb76f5c'); },
  },
  'mqtt-connection-flapping': {
    get name() { return translateNative('native.8de600c98a32abe5'); },
    get cause() { return translateNative('native.c9500defa37731bb'); },
    get fix() { return translateNative('native.7237f754c4c207a5'); },
  },
  'camera-connection-refused': {
    get name() { return translateNative('native.103ce4a652640c4e'); },
    get cause() { return translateNative('native.e9288a04d42ad7d8'); },
    get fix() { return translateNative('native.b24b45287dce713d'); },
  },
  'bambu-cloud-captcha': {
    get name() { return translateNative('native.173cb88a8fb49c82'); },
    get cause() { return translateNative('native.5f163f524abd16c0'); },
    get fix() { return translateNative('native.4b77640907a8b3db'); },
  },
  'database-locked': {
    get name() { return translateNative('native.15c03944622132ae'); },
    get cause() { return translateNative('native.5f77d7eeffc34c1e'); },
    get fix() { return translateNative('native.8402053ad8d8b8c5'); },
  },
};

export function SystemHealthPanel({ result }: { result: SystemHealthResult }) {
  useNativeLocale();
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
              {remedy?.name ?? finding.signature_id}{' '}
              · {finding.severity} · {finding.category}
            </Text>
            {remedy ? (
              <>
                <Text style={{ color: colors.textSecondary }}>
                  {remedy.cause}
                </Text>
                <Text style={{ color: colors.text }}>
                  {remedy.fix}
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
