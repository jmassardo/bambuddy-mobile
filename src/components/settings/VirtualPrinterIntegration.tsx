import { NativeTranslation, nativeMessage, translateNative, useNativeLocale, useTranslation } from '@/i18n';

import { localizedStatus } from '@/utils/statusLabel';

import React, { useState } from 'react';
import Clipboard from '@react-native-clipboard/clipboard';
import { Text } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { integrationsApi } from '@/api/integrations';
import { PrimaryButton, SectionCard } from '@/components/common/AppUI';
import { useTheme } from '@/theme';
import { useToast } from '@/contexts/ToastContext';
import { shareBlob } from '@/utils/share';

import { OptionChipsField, settingsStyles } from './shared';

const diagnosticHelp: Record<string, string> = {
  get enabled() { return translateNative('native.277db6b928719be1'); },
  get running() { return translateNative('native.8b54e9064d0deb09'); },
  get bind_interface() { return translateNative('native.155c772650cf074e'); },
  get access_code() { return translateNative('native.a8dd385ec8250b8d'); },
  get target_printer() { return translateNative('native.1783e1c9e34caf1c'); },
  get port_ftps() { return translateNative('native.30fd6609cd4a29d0'); },
  get port_mqtt() { return translateNative('native.1c7eebcd9d652373'); },
  get port_bind() { return translateNative('native.d8f3cc57cd5220df'); },
  get certificate() { return translateNative('native.3c2c50264e41208f'); },
  get network_mode() { return translateNative('native.750df27473404a30'); },
  get privileged_ports() { return translateNative('native.d176e8074e0628d2'); },
};

export function VirtualPrinterDiagnostics({ id, target = false }: { id: number; target?: boolean }) {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const diagnostic = useMutation({ mutationFn: async () => {
    const result = await (target ? integrationsApi.diagnoseTarget(id) : integrationsApi.diagnoseVP(id));
    return { overall: result.overall, checks: result.checks };
  } });
  return <>
    <PrimaryButton label={t('integrations.diagnose', { defaultValue: diagnostic.data || diagnostic.error ? translateNative('native.ef2ef7fd7abf634e') : target ? translateNative('native.06c71ceccdc15c8a') : translateNative('native.7522c21f23833bf5') })} variant="secondary" disabled={diagnostic.isPending} loading={diagnostic.isPending} onPress={() => diagnostic.mutate()} />
    {diagnostic.error ? <Text style={{ color: colors.error }}>{diagnostic.error.message}</Text> : null}
    {diagnostic.data ? <>
      <Text accessibilityLiveRegion="polite" style={[settingsStyles.itemTitle, { color: colors.text }]}>{t('integrations.diagnosis', { defaultValue: 'Overall diagnosis: {{result}}', result: localizedStatus(diagnostic.data.overall) })}</Text>
      {diagnostic.data.checks.map(check => <Text key={check.id} selectable style={{ color: check.status === 'fail' ? colors.error : colors.text }}>
        {check.id.replace(/_/g, ' ')}: {localizedStatus(check.status)}
        {Object.keys(check.params).length ? `\n${Object.entries(check.params).map(([key, value]) => `${key}: ${String(value)}`).join(' • ')}` : ''}
        {check.status === 'fail' || check.status === 'warn' ? `\n${t(`integrations.help.${check.id}`, { defaultValue: diagnosticHelp[check.id] || 'Check printer LAN settings, firewall access and server logs, then retry.' })}` : ''}
      </Text>)}
    </> : null}
  </>;
}

export function VirtualPrinterGlobalSetup({ canEdit }: { canEdit: boolean }) {
  useNativeLocale();
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
      <Text selectable style={{ color: colors.text }}><NativeTranslation id="native.965da0c7cebd5a49" values={{ value0: (certificate.data.fingerprint_sha256) }} /></Text>
      <PrimaryButton label={t('integrations.copyCA', { defaultValue: 'Copy CA certificate' })} variant="secondary" onPress={() => { Clipboard.setString(certificate.data!.pem); showToast(nativeMessage('integrations.copied', () => ({ defaultValue: 'Copied to clipboard.' })), 'success'); }} />
      <PrimaryButton label={t('integrations.shareCA', { defaultValue: 'Share / save CA certificate' })} variant="secondary" disabled={sharing} loading={sharing} onPress={async () => {
        setSharing(true);
        try { await shareBlob(new Blob([certificate.data!.pem], { type: 'application/x-pem-file', lastModified: Date.now() }), 'bambuddy-ca.crt'); }
        catch (error) { showToast(error instanceof Error ? error.message : nativeMessage('native.ea642b2d8190451d'), 'error'); }
        finally { setSharing(false); }
      }} />
    </> : null}
    {certificate.error || settings.error ? <PrimaryButton label={t('common.retry', { defaultValue: 'Retry' })} variant="secondary" onPress={() => { void certificate.refetch(); void settings.refetch(); }} /> : null}
    {certificate.error ? <Text style={{ color: colors.error }}>{certificate.error.message}</Text> : null}
    {settings.error ? <Text style={{ color: colors.error }}>{settings.error.message}</Text> : null}
    {settings.data ? <OptionChipsField label={t('integrations.archiveNaming', { defaultValue: 'Archive name source' })} value={settings.data.archive_name_source} disabled={!canEdit || naming.isPending} options={[{ key: 'metadata', get label() { return translateNative('integrations.metadata', { defaultValue: 'Embedded metadata' }); } }, { key: 'filename', get label() { return translateNative('integrations.filename', { defaultValue: 'Uploaded filename' }); } }]} onChange={value => naming.mutate(value as 'metadata' | 'filename')} /> : null}
  </SectionCard>;
}

export function VirtualPrinterAddress({ disabled }: { disabled: boolean }) {
  useNativeLocale();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const address = useQuery({ queryKey: ['vpTailscale'], queryFn: integrationsApi.tailscale });
  if (disabled || !address.data?.available || !address.data.fqdn) return null;
  return <PrimaryButton label={t('integrations.copyAddress', { defaultValue: 'Copy slicer address: {{address}}', address: address.data.fqdn })} variant="secondary" onPress={() => { Clipboard.setString(address.data!.fqdn); showToast(nativeMessage('integrations.copied', () => ({ defaultValue: 'Copied to clipboard.' })), 'success'); }} />;
}
