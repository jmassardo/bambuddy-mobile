import { translateNative, useNativeLocale } from '@/i18n';

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme';

import { spacing } from '@/theme/tokens';
import type { PrinterDiagnosticResult } from '@/types/api';
import { localizedStatus } from '@/utils/statusLabel';

const checks: Record<
  string,
  { title: string; advice: string; reasons?: Record<string, string> }
> = {
  port_mqtt: {
    get title() { return translateNative('native.1c7251891ca2e324'); },
    get advice() { return translateNative('native.f32814c1e9b2bd71'); },
  },
  port_ftps: {
    get title() { return translateNative('native.4727759f134b861f'); },
    get advice() { return translateNative('native.a06b13417e068543'); },
    reasons: {
      get no_tls() { return translateNative('native.fb83d83fd68872ea'); },
    },
  },
  port_rtsps: {
    get title() { return translateNative('native.8aae6aeb71759ac5'); },
    get advice() { return translateNative('native.be1c94b30d106316'); },
  },
  external_storage: {
    get title() { return translateNative('native.2d97bdac97d660d6'); },
    get advice() { return translateNative('native.02ee1846fdb6d3c3'); },
    reasons: {
      get unsupported_model() { return translateNative('native.1d289db493c3da5e'); },
      get no_media() { return translateNative('native.51626a257886876b'); },
      get internal_storage() { return translateNative('native.8eca1f07394b4fea'); },
      get internal_history() { return translateNative('native.64cbe305f359d4ce'); },
    },
  },
  macos_local_network: {
    get title() { return translateNative('native.346365a36f14f35f'); },
    get advice() { return translateNative('native.908e899c53df3038'); },
    reasons: {
      get unsigned() { return translateNative('native.8022fd1832c5406b'); },
    },
  },
  network_mode: {
    get title() { return translateNative('native.271cb83f51ec20a7'); },
    get advice() { return translateNative('native.1b130f404a01c121'); },
  },
  subnet: {
    get title() { return translateNative('native.ca917429b65c05b6'); },
    get advice() { return translateNative('native.906fbf029378e792'); },
  },
  mqtt_auth: {
    get title() { return translateNative('native.f6ea71b1b92a1fe9'); },
    get advice() { return translateNative('native.8a9ddb48f8f64c6c'); },
  },
  developer_mode: {
    get title() { return translateNative('native.ca3db4f487c742d1'); },
    get advice() { return translateNative('native.cbe62e8cc567a010'); },
  },
  printer_publishing: {
    get title() { return translateNative('native.4a2dc31eba78f8b9'); },
    get advice() { return translateNative('native.d5f97469a5765767'); },
  },
};

export function DiagnosticChecklist({
  result,
}: {
  result: PrinterDiagnosticResult;
}) {
  useNativeLocale();
  const { colors } = useTheme();
  return (
    <View style={styles.list}>
      {result.checks.map(check => {
        const description = checks[check.id];
        const reason =
          typeof check.params.reason === 'string' ? check.params.reason : '';
        const advice = description?.reasons?.[reason] ?? description?.advice;
        return (
          <View key={check.id} style={styles.item}>
            <Text
              style={{
                color: check.status === 'fail' ? colors.error : colors.text,
              }}
            >
              {description?.title ?? check.id}{' '}
              ·{' '}
              {localizedStatus(check.status)}
            </Text>
            {(check.status === 'fail' || check.status === 'warn') && advice ? (
              <Text style={{ color: colors.text }}>
                {advice}
              </Text>
            ) : null}
            <Text style={{ color: colors.textSecondary }}>
              {Object.entries(check.params)
                .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value}`)
                .join(' · ')}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
const styles = StyleSheet.create({
  list: { gap: spacing.md },
  item: { gap: spacing.xs },
});
