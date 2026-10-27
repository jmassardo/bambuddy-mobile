import React, { useState } from 'react';
import Clipboard from '@react-native-clipboard/clipboard';
import { Text } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { integrationsApi } from '@/api/integrations';
import { PrimaryButton, SectionCard } from '@/components/common/AppUI';
import { useTheme } from '@/theme';
import { useToast } from '@/contexts/ToastContext';
import { shareBlob } from '@/utils/share';
import { useTranslation } from '@/i18n';
import { OptionChipsField, settingsStyles } from './shared';

const diagnosticHelp: Record<string, string> = {
  enabled: 'Enable this virtual printer in its configuration.',
  running: 'Enable or restart the virtual printer; inspect server logs if startup fails.',
  bind_interface: 'Choose an interface/IP present on the server and reachable from the slicer.',
  access_code: 'Set an eight-character access code and use the same code in your slicer.',
  target_printer: 'Select an online target printer with valid LAN credentials.',
  port_ftps: 'Allow TCP 990 between the slicer and the virtual printer.',
  port_mqtt: 'Allow TCP 8883 between the slicer and the virtual printer.',
  port_bind: 'Release ports used by another process or choose another bind IP.',
  certificate: 'Share/import the CA certificate into the slicer trust store.',
  network_mode: 'Use host networking for discovery or configure an explicit reachable bind address.',
  privileged_ports: 'Grant CAP_NET_BIND_SERVICE to the server (Docker cap_add: NET_BIND_SERVICE), or configure an appropriate port redirect for FTPS 990.',
};

export function VirtualPrinterDiagnostics({ id, target = false }: { id: number; target?: boolean }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const diagnostic = useMutation({ mutationFn: async () => {
    const result = await (target ? integrationsApi.diagnoseTarget(id) : integrationsApi.diagnoseVP(id));
    return { overall: result.overall, checks: result.checks };
  } });
  return <>
    <PrimaryButton label={t('integrations.diagnose', { defaultValue: diagnostic.data || diagnostic.error ? 'Retry diagnostics' : target ? 'Test target connection' : 'Run diagnostics' })} variant="secondary" disabled={diagnostic.isPending} loading={diagnostic.isPending} onPress={() => diagnostic.mutate()} />
    {diagnostic.error ? <Text style={{ color: colors.error }}>{diagnostic.error.message}</Text> : null}
    {diagnostic.data ? <>
      <Text accessibilityLiveRegion="polite" style={[settingsStyles.itemTitle, { color: colors.text }]}>{t('integrations.diagnosis', { defaultValue: 'Overall diagnosis: {{result}}', result: diagnostic.data.overall })}</Text>
      {diagnostic.data.checks.map(check => <Text key={check.id} selectable style={{ color: check.status === 'fail' ? colors.error : colors.text }}>
        {t(`integrations.check.${check.id}`, { defaultValue: check.id.replace(/_/g, ' ') })}: {check.status}
        {Object.keys(check.params).length ? `\n${Object.entries(check.params).map(([key, value]) => `${key}: ${String(value)}`).join(' • ')}` : ''}
        {check.status === 'fail' || check.status === 'warn' ? `\n${t(`integrations.help.${check.id}`, { defaultValue: diagnosticHelp[check.id] || 'Check printer LAN settings, firewall access and server logs, then retry.' })}` : ''}
      </Text>)}
    </> : null}
  </>;
}

export function VirtualPrinterGlobalSetup({ canEdit }: { canEdit: boolean }) {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const client = useQueryClient();
  const [sharing, setSharing] = useState(false);
  const certificate = useQuery({ queryKey: ['vpCertificate'], queryFn: integrationsApi.certificate });
  const settings = useQuery({ queryKey: ['vpGlobalSettings'], queryFn: integrationsApi.vpSettings });
  const naming = useMutation({
    mutationFn: integrationsApi.saveArchiveNaming,
    onSuccess: () => client.invalidateQueries({ queryKey: ['vpGlobalSettings'] }),
    onError: (error: Error) => showToast(error.message, 'error'),
  });
  return <SectionCard title={t('integrations.vpSetup', { defaultValue: 'Slicer trust and archive naming' })}>
    {certificate.data ? <>
      <Text selectable style={{ color: colors.text }}>SHA-256: {certificate.data.fingerprint_sha256}</Text>
      <PrimaryButton label={t('integrations.copyCA', { defaultValue: 'Copy CA certificate' })} variant="secondary" onPress={() => { Clipboard.setString(certificate.data!.pem); showToast(t('integrations.copied', { defaultValue: 'Copied to clipboard.' }), 'success'); }} />
      <PrimaryButton label={t('integrations.shareCA', { defaultValue: 'Share / save CA certificate' })} variant="secondary" disabled={sharing} loading={sharing} onPress={async () => {
        setSharing(true);
        try { await shareBlob(new Blob([certificate.data!.pem], { type: 'application/x-pem-file', lastModified: Date.now() }), 'bambuddy-ca.crt'); }
        catch (error) { showToast(error instanceof Error ? error.message : 'Unable to share certificate.', 'error'); }
        finally { setSharing(false); }
      }} />
    </> : null}
    {certificate.error || settings.error ? <PrimaryButton label={t('common.retry', { defaultValue: 'Retry' })} variant="secondary" onPress={() => { void certificate.refetch(); void settings.refetch(); }} /> : null}
    {certificate.error ? <Text style={{ color: colors.error }}>{certificate.error.message}</Text> : null}
    {settings.error ? <Text style={{ color: colors.error }}>{settings.error.message}</Text> : null}
    {settings.data ? <OptionChipsField label={t('integrations.archiveNaming', { defaultValue: 'Archive name source' })} value={settings.data.archive_name_source} disabled={!canEdit || naming.isPending} options={[{ key: 'metadata', label: t('integrations.metadata', { defaultValue: 'Embedded metadata' }) }, { key: 'filename', label: t('integrations.filename', { defaultValue: 'Uploaded filename' }) }]} onChange={value => naming.mutate(value as 'metadata' | 'filename')} /> : null}
  </SectionCard>;
}

export function VirtualPrinterAddress({ disabled }: { disabled: boolean }) {
  const { showToast } = useToast();
  const { t } = useTranslation();
  const address = useQuery({ queryKey: ['vpTailscale'], queryFn: integrationsApi.tailscale });
  if (disabled || !address.data?.available || !address.data.fqdn) return null;
  return <PrimaryButton label={t('integrations.copyAddress', { defaultValue: 'Copy slicer address: {{address}}', address: address.data.fqdn })} variant="secondary" onPress={() => { Clipboard.setString(address.data!.fqdn); showToast(t('integrations.copied', { defaultValue: 'Copied to clipboard.' }), 'success'); }} />;
}
