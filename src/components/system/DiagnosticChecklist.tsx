import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme';
import { useTranslation } from '@/i18n';
import { spacing } from '@/theme/tokens';
import type { PrinterDiagnosticResult } from '@/types/api';

const checks: Record<
  string,
  { title: string; advice: string; reasons?: Record<string, string> }
> = {
  port_mqtt: {
    title: 'Control port (MQTT 8883)',
    advice:
      'Verify the printer IP, power and routing; allow TCP port 8883 from the server.',
  },
  port_ftps: {
    title: 'File-transfer port (FTPS 990)',
    advice:
      'Allow TCP port 990 from the server. An unreachable file service prevents sending and retrieving print files.',
    reasons: {
      no_tls:
        'The printer file service is reachable but its TLS handshake is stuck. Restart the printer to recover it.',
    },
  },
  port_rtsps: {
    title: 'Camera port',
    advice:
      'Enable LAN liveview and allow the reported camera port from the server. This does not affect printing.',
  },
  external_storage: {
    title: 'Store sent files on external storage',
    advice:
      'Enable external file storage on the printer or in the slicer, and insert a storage card for complete archives.',
    reasons: {
      unsupported_model:
        'This firmware has no external-storage toggle. Nothing can be changed here; archive metadata may be incomplete.',
      no_media:
        'The option is enabled but no storage card or stick is present. Insert storage and print again.',
      internal_storage:
        'The last print ran from inaccessible internal storage. Start prints from BambuBuddy, use OrcaSlicer, or send with External selected in Bambu Studio.',
      internal_history:
        'The last print was a reprint from internal history. Send a new file to external storage for a complete archive.',
    },
  },
  macos_local_network: {
    title: 'macOS Local Network permission',
    advice:
      'Allow the server Python runtime in macOS Privacy & Security → Local Network.',
    reasons: {
      unsigned:
        'The server Python runtime is unsigned. Run the server macOS updater to sign it, then restart BambuBuddy.',
    },
  },
  network_mode: {
    title: 'Container network mode',
    advice:
      'Printer discovery and Virtual Printer require host networking on supported container hosts. Review the container networking configuration.',
  },
  subnet: {
    title: 'Network subnet',
    advice:
      'Configure routing and firewall access between the server and printer subnets.',
  },
  mqtt_auth: {
    title: 'Printer credentials',
    advice:
      'Re-copy the current LAN access code and exact serial number from the printer. Toggling LAN or Developer Mode changes the access code.',
  },
  developer_mode: {
    title: 'LAN Developer Mode',
    advice:
      'Enable Developer Mode in the printer LAN settings and confirm the change to allow printing.',
  },
  printer_publishing: {
    title: 'Printer status publishing',
    advice:
      'Verify the exact case-sensitive serial number. MQTT can connect while receiving no status reports on the wrong serial topic.',
  },
};

export function DiagnosticChecklist({
  result,
}: {
  result: PrinterDiagnosticResult;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
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
              {t(`system.diagnostic.${check.id}.title`, {
                defaultValue: description?.title ?? check.id,
              })}{' '}
              ·{' '}
              {t(`system.diagnostic.status.${check.status}`, {
                defaultValue: check.status,
              })}
            </Text>
            {(check.status === 'fail' || check.status === 'warn') && advice ? (
              <Text style={{ color: colors.text }}>
                {t(`system.diagnostic.${check.id}.${reason || 'advice'}`, {
                  defaultValue: advice,
                })}
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
