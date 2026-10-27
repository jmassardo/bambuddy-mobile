import React, { useEffect, useState } from 'react';
import { Alert, AppState, Linking, ScrollView, StyleSheet, Switch, Text, View, Share } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useIsFocused } from '@react-navigation/native';
import { camerasApi } from '@/api/cameras';
import { printersApi } from '@/api/printers';
import { useServerStore } from '@/api/server';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/theme';
import { useTranslation } from '@/i18n';
import { PrimaryButton, SectionCard, TextField } from '@/components/common/AppUI';
import { CameraChoices, CameraMessage } from '@/components/printers/CameraControls';
import { OverlayPreview } from '@/components/printers/OverlayPreview';
import { cameraIntegrationUrl, overlayFields, overlayUrl, type OverlayOptions } from '@/utils/cameraIntegrations';
import type { CameraIntegrationToken, CameraTokenScope } from '@/types/api';
import { spacing } from '@/theme/tokens';
import { getAuthToken } from '@/api/http';
import { formatPreferredDateTime } from '@/utils/preferences';

function IntegrationActions({ value }: { value: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);
  return <View style={styles.actions}>
    <Text selectable style={{ color: colors.text }}>{value}</Text>
    <PrimaryButton label={copied ? t('common.copied', { defaultValue: 'Copied' }) : t('common.copy', { defaultValue: 'Copy' })} onPress={() => { Clipboard.setString(value); setCopied(true); }} />
    <PrimaryButton label={t('common.share', { defaultValue: 'Share' })} onPress={() => void Share.share({ message: value }).catch(() => undefined)} />
  </View>;
}

export function CameraTokenManager({ printerId }: { printerId: number }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { isAdmin, authEnabled, user, hasPermission } = useAuth();
  const server = useServerStore(state => state.serverUrl);
  const [all, setAll] = useState(false);
  const [name, setName] = useState('');
  const [days, setDays] = useState('30');
  const [scope, setScope] = useState<CameraTokenScope>('camera_stream');
  const [created, setCreated] = useState<CameraIntegrationToken | null>(null);
  const validDays = /^\d+$/.test(days) && Number(days) >= 1 && Number(days) <= 365;
  const canManage = authEnabled && Boolean(user) && hasPermission('camera:view');
  let createdUrl: string | null = null;
  if (created?.token && server) {
    try { createdUrl = cameraIntegrationUrl(server, created.scope, created.token, printerId); } catch { /* Fail closed for malformed configured server URLs. */ }
  }
  const tokens = useQuery({
    queryKey: ['cameraIntegrationTokens', server, user?.id, all && isAdmin],
    queryFn: () => camerasApi.tokens(all && isAdmin),
    enabled: canManage,
  });
  const create = useMutation({
    mutationFn: () => camerasApi.createToken(name.trim(), Number(days), scope),
    onSuccess: async result => { setCreated(result); setName(''); await queryClient.invalidateQueries({ queryKey: ['cameraIntegrationTokens'] }); },
  });
  const revoke = useMutation({
    mutationFn: camerasApi.revokeToken,
    onSuccess: async (_, id) => {
      if (created?.id === id) setCreated(null);
      await queryClient.invalidateQueries({ queryKey: ['cameraIntegrationTokens'] });
    },
  });
  useEffect(() => { setCreated(null); setAll(false); }, [server, user?.id]);
  return <SectionCard title={t('camera.tokens', { defaultValue: 'Camera integration tokens' })}>
    {!canManage ? <CameraMessage>{t('camera.tokenRequiresAuth', { defaultValue: 'Sign in with camera permission to manage user-owned integration tokens.' })}</CameraMessage> : <>
      <TextField label={t('camera.tokenName', { defaultValue: 'Token name' })} value={name} onChangeText={setName} />
      <TextField label={t('camera.tokenDays', { defaultValue: 'Expires in days (1–365)' })} value={days} onChangeText={setDays} keyboardType="number-pad" />
      <CameraChoices label={t('camera.tokenScope', { defaultValue: 'Token scope' })} value={scope} options={['camera_stream', 'camwall', 'overlay']} onChange={setScope} />
      <CameraMessage>{scope === 'camwall'
        ? t('camera.scopeWall', { defaultValue: 'Wall tokens expose all printer names, state and video, but no filenames or addresses.' })
        : scope === 'overlay'
          ? t('camera.scopeOverlay', { defaultValue: 'Overlay tokens expose camera and live print status, including filenames. Treat shared URLs like secrets.' })
          : t('camera.scopeStream', { defaultValue: 'Camera stream tokens expose video only.' })}</CameraMessage>
      <PrimaryButton label={t('camera.createToken', { defaultValue: 'Create camera token' })} loading={create.isPending} disabled={!name.trim() || !validDays || create.isPending} onPress={() => create.mutate()} />
      {create.error ? <CameraMessage>{create.error.message}</CameraMessage> : null}
      {created?.token && server ? <SectionCard title={t('camera.oneTimeToken', { defaultValue: 'Shown once — copy before dismissing' })}>
        <IntegrationActions value={created.token} />
        <CameraMessage>{t('camera.integrationUrl', { defaultValue: 'Integration URL (selected printer where applicable)' })}</CameraMessage>
        {createdUrl ? <IntegrationActions value={createdUrl} /> : <CameraMessage>{t('camera.invalidServer', { defaultValue: 'Configure a valid HTTP(S) server without embedded credentials to generate an integration URL.' })}</CameraMessage>}
        <PrimaryButton label={t('common.dismiss', { defaultValue: 'Dismiss' })} onPress={() => { setCreated(null); create.reset(); }} />
      </SectionCard> : null}
      <PrimaryButton label={all ? t('camera.myTokens', { defaultValue: 'Show my tokens' }) : t('camera.allTokens', { defaultValue: 'Show all users’ tokens (admin)' })} disabled={!isAdmin && !all} onPress={() => setAll(current => !current)} />
      <CameraMessage>{all && isAdmin ? t('camera.adminReview', { defaultValue: 'Administrator review — all owners' }) : t('camera.personalReview', { defaultValue: 'Personal tokens' })}</CameraMessage>
      {tokens.isError ? <PrimaryButton label={t('common.retry', { defaultValue: 'Retry' })} onPress={() => void tokens.refetch()} /> : null}
      {tokens.data?.map(token => <SectionCard key={token.id} title={token.name}>
        <CameraMessage>{t('camera.tokenMetadata', { defaultValue: 'Owner #{{owner}} · Scope {{scope}} · Prefix {{prefix}}', owner: token.user_id, scope: token.scope, prefix: token.lookup_prefix })}</CameraMessage>
        <CameraMessage>{t('camera.tokenDates', { defaultValue: 'Created {{created}} · Expires {{expires}} · Last used {{used}}', created: formatPreferredDateTime(token.created_at), expires: formatPreferredDateTime(token.expires_at), used: formatPreferredDateTime(token.last_used_at) })}</CameraMessage>
        <PrimaryButton label={t('camera.revoke', { defaultValue: 'Revoke token' })} variant="danger" disabled={revoke.isPending} onPress={() => Alert.alert(
          t('camera.confirmRevoke', { defaultValue: 'Revoke this token?' }),
          t('camera.revokeWarning', { defaultValue: '{{name}} will stop working immediately in all integrations.', name: token.name }),
          [{ text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
            { text: t('camera.revoke', { defaultValue: 'Revoke token' }), style: 'destructive', onPress: () => revoke.mutate(token.id) }],
        )} />
      </SectionCard>)}
      {revoke.error ? <CameraMessage>{revoke.error.message}</CameraMessage> : null}
    </>}
  </SectionCard>;
}

export default function CameraIntegrationsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { authEnabled, user, hasPermission } = useAuth();
  const focused = useIsFocused();
  const server = useServerStore(state => state.serverUrl);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [preview, setPreview] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [options, setOptions] = useState<OverlayOptions>({
    printerId: 1, fields: ['progress', 'layers', 'eta', 'filename', 'status'],
    size: 'medium', artwork: '1', fps: 15, camera: true, token: '',
  });
  const [fpsInput, setFpsInput] = useState('15');
  const fpsValid = /^\d+$/.test(fpsInput) && Number(fpsInput) >= 1 && Number(fpsInput) <= 30;
  const printers = useQuery({ queryKey: ['printers'], queryFn: printersApi.getPrinters });
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setAppActive(state === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    setPreview(false);
    setOptions(current => ({ ...current, token: '' }));
  }, [server, user?.id]);
  useEffect(() => {
    if (printers.data?.length && !printers.data.some(printer => printer.id === options.printerId)) {
      setOptions(current => ({ ...current, printerId: printers.data[0].id }));
    }
  }, [options.printerId, printers.data]);
  let url = '';
  try { url = server ? overlayUrl(server, options) : ''; } catch { /* Invalid server URLs never enter the preview or external browser. */ }
  return <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
    <SectionCard title={t('camera.overlayBuilder', { defaultValue: 'OBS streaming-overlay URL builder' })}>
      <CameraMessage>{t('camera.selectPrinter', { defaultValue: 'Select printer' })}</CameraMessage>
      {printers.data?.map(printer => <PrimaryButton key={printer.id} label={`${options.printerId === printer.id ? '✓ ' : ''}${printer.name}`} variant="secondary" onPress={() => setOptions(current => ({ ...current, printerId: printer.id }))} />)}
      <CameraChoices label={t('camera.textSize', { defaultValue: 'Text size' })} options={['small', 'medium', 'large']} value={options.size} onChange={size => setOptions(current => ({ ...current, size }))} />
      <CameraChoices label={t('camera.artwork', { defaultValue: 'Artwork (1 = classic, 2 = version 2)' })} options={['1', '2']} value={options.artwork} onChange={artwork => setOptions(current => ({ ...current, artwork }))} />
      <TextField label={t('camera.fps', { defaultValue: 'Frames per second (1–30)' })} value={fpsInput} keyboardType="number-pad" onChangeText={value => {
        setFpsInput(value);
        const fps = Number(value);
        if (Number.isInteger(fps) && fps >= 1 && fps <= 30) setOptions(current => ({ ...current, fps }));
      }} />
      {overlayFields.map(field => <View key={field} style={styles.toggle}>
        <CameraMessage>{t(`camera.overlayField.${field}`, { defaultValue: field })}</CameraMessage>
        <Switch accessibilityLabel={t(`camera.overlayField.${field}`, { defaultValue: field })} value={options.fields.includes(field)} onValueChange={enabled => setOptions(current => ({ ...current, fields: enabled ? [...current.fields, field] : current.fields.filter(value => value !== field) }))} />
      </View>)}
      <View style={styles.toggle}>
        <CameraMessage>{t('camera.showCamera', { defaultValue: 'Show camera' })}</CameraMessage>
        <Switch accessibilityLabel={t('camera.showCamera', { defaultValue: 'Show camera' })} value={options.camera} onValueChange={camera => setOptions(current => ({ ...current, camera }))} />
      </View>
      <TextField label={t('camera.overlayToken', { defaultValue: 'Overlay token (optional; required for OBS when login is enabled)' })} value={options.token} autoCapitalize="none" onChangeText={token => setOptions(current => ({ ...current, token }))} />
      {url && fpsValid ? <>
        <IntegrationActions value={url} />
        <PrimaryButton label={t('camera.openUrl', { defaultValue: 'Open overlay URL' })} onPress={() => {
          setOpenError(null);
          void Linking.openURL(url).catch(() => setOpenError(t('camera.openFailed', { defaultValue: 'Unable to open overlay URL.' })));
        }} />
        <PrimaryButton label={preview ? t('camera.hidePreview', { defaultValue: 'Stop preview' }) : t('camera.showPreview', { defaultValue: 'Preview overlay' })} onPress={() => setPreview(current => !current)} />
        {openError ? <CameraMessage>{openError}</CameraMessage> : null}
        {preview && focused && appActive && (!authEnabled || Boolean(user)) && hasPermission('camera:view') ? <OverlayPreview key={`${url}:${getAuthToken()}`} url={url} /> : null}
      </> : null}
    </SectionCard>
    <CameraTokenManager key={`${server}:${user?.id}`} printerId={options.printerId} />
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md },
  actions: { gap: spacing.sm },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
