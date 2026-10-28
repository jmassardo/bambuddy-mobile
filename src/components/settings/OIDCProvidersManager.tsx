import { nativeMessage, translateNative, useNativeLocale, useNativeMessageState, useTranslation } from '@/i18n';

import React, { useState } from 'react';
import { Alert, Image, Text, View, StyleSheet } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/api/auth';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/theme';
import { PrimaryButton, SectionCard, TextField } from '@/components/common/AppUI';
import { SwitchRow, OptionChipsField } from './shared';
import type { OIDCProvider, OIDCProviderCreate } from '@/types/api';
import { spacing } from '@/theme/tokens';

type Mapping = { external: string; local: string };
const DEFAULT: OIDCProviderCreate = {
  name: '', issuer_url: '', client_id: '', client_secret: '', get scopes() { return translateNative('native.a78c1991f70d3ab8'); },
  is_enabled: true, auto_create_users: false, auto_link_existing_accounts: false,
  require_email_verified: true, email_claim: 'email', group_claim: 'groups',
  group_mapping: {}, default_group_id: null, icon_url: null, is_autologin: false,
};
function providerIconUrl(id: number, version: number): string {
  const url = authApi.getOIDCProviderIconUrl(id);
  return `${url}${url.includes('?') ? '&' : '?'}refresh=${version}`;
}

export function oidcGroupMapping(rows: Mapping[], localNames: string[]): Record<string, string> {
  const result: Record<string, string> = Object.create(null) as Record<string, string>;
  const seen = new Set<string>();
  for (const row of rows) {
    const external = row.external.trim();
    const local = row.local.trim();
    if (!external || !local || !localNames.includes(local)) throw new Error(translateNative('native.478ba7346058ebd0'));
    if (seen.has(external.toLowerCase())) throw new Error(translateNative('native.96f2bc9bff4f7767'));
    seen.add(external.toLowerCase());
    result[external] = local;
  }
  if (rows.length > 100) throw new Error(translateNative('native.7490061e0958e311'));
  return result;
}

export function OIDCProvidersManager() {
  useNativeLocale();
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('settings:update');
  const canReadGroups = hasPermission('groups:read');
  const { colors } = useTheme();
  const client = useQueryClient();
  const [editing, setEditing] = useState<OIDCProvider | null | undefined>(undefined);
  const [form, setForm] = useState(DEFAULT);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [message, setMessage] = useNativeMessageState('');
  const query = useQuery({ queryKey: ['oidcProvidersAll'], queryFn: authApi.getOIDCProvidersAll, enabled: canManage && hasPermission('settings:read') });
  const groups = useQuery({ queryKey: ['groups'], queryFn: authApi.getGroups, enabled: canManage && canReadGroups });
  const refresh = async () => {
    await Promise.all(['oidcProvidersAll', 'oidcProviders', 'advancedAuthStatus'].map(key => client.invalidateQueries({ queryKey: [key] })));
  };
  const open = (provider: OIDCProvider | null) => {
    setEditing(provider);
    setForm(provider ? {
      ...DEFAULT, ...provider, client_secret: '',
      group_claim: provider.group_claim ?? 'groups', group_mapping: provider.group_mapping ?? {},
    } : { ...DEFAULT });
    setMappings(Object.entries(provider?.group_mapping ?? {}).map(([external, local]) => ({ external, local })));
    setMessage('');
  };
  const save = useMutation({
    mutationFn: async () => {
      if (!canManage) throw new Error(translateNative('native.197d9fa641f4eb71'));
      if (!form.name.trim() || !form.client_id.trim()) throw new Error(translateNative('native.dbb717b299b8253b'));
      if (!form.issuer_url.startsWith('https://')) throw new Error(translateNative('native.dd1a657403df4187'));
      if (form.icon_url && !form.icon_url.startsWith('https://')) throw new Error(translateNative('native.706954eec51af598'));
      if (form.auto_link_existing_accounts && form.email_claim === 'email' && !form.require_email_verified) throw new Error(translateNative('native.67850b795e00b7f6'));
      const payload: Partial<OIDCProviderCreate> = {
        ...form, name: form.name.trim(), group_mapping: canReadGroups
          ? oidcGroupMapping(mappings, (groups.data ?? []).map(g => g.name))
          : editing?.group_mapping ?? {},
      };
      if (editing && !form.client_secret) delete payload.client_secret;
      if (editing) {
        const saved = await authApi.updateOIDCProvider(editing.id, payload);
        if (payload.default_group_id === null && saved?.default_group_id != null) {
          throw new Error(translateNative('native.7f335228315bbc82'));
        }
        return saved;
      }
      if (!form.client_secret) throw new Error(translateNative('native.d9613f2e8ef573f5'));
      return authApi.createOIDCProvider(payload as OIDCProviderCreate);
    },
    onSuccess: async () => { setEditing(undefined); setForm(DEFAULT); setMessage(nativeMessage('auth.providerSaved', () => ({ defaultValue: 'Provider saved.' }))); await refresh(); },
    onError: async (e: Error) => { setMessage(e.message); await refresh(); },
  });
  const action = useMutation({
    mutationFn: async ({ provider, kind }: { provider: OIDCProvider; kind: 'delete' | 'refresh' | 'remove' }) => {
      if (kind === 'delete') return authApi.deleteOIDCProvider(provider.id);
      if (kind === 'remove') return authApi.deleteOIDCProviderIcon(provider.id);
      return authApi.refreshOIDCProviderIcon(provider.id);
    },
    onSuccess: async () => { setMessage(nativeMessage('auth.providerUpdated', () => ({ defaultValue: 'Provider updated.' }))); await refresh(); },
    onError: (e: Error) => setMessage(e.message),
  });
  if (!canManage) return <SectionCard title={t('auth.oidcProviders', { defaultValue: 'OIDC providers' })}><Text style={{ color: colors.textSecondary }}>{t('auth.settingsUpdateRequired', { defaultValue: 'Settings update permission is required.' })}</Text></SectionCard>;
  return <SectionCard title={t('auth.oidcProviders', { defaultValue: 'OIDC providers' })} subtitle={t('auth.oidcHint', { defaultValue: 'Claims, provisioning, group sync, branding and automatic sign-in.' })}>
    {message ? <Text accessibilityRole="alert" style={{ color: colors.text }}>{message}</Text> : null}
    {query.isError ? <><Text style={{ color: colors.error }}>{query.error.message}</Text><PrimaryButton label={t('auth.retryProviders', { defaultValue: 'Retry providers' })} onPress={() => void query.refetch()} /></> : null}
    {editing !== undefined ? <>
      <TextField label={t('auth.providerName', { defaultValue: 'Provider name' })} value={form.name} onChangeText={name => setForm(f => ({ ...f, name }))} />
      <TextField label={t('auth.issuerUrl', { defaultValue: 'Issuer URL' })} value={form.issuer_url} onChangeText={issuer_url => setForm(f => ({ ...f, issuer_url }))} autoCapitalize="none" />
      <TextField label={t('auth.clientId', { defaultValue: 'Client ID' })} value={form.client_id} onChangeText={client_id => setForm(f => ({ ...f, client_id }))} autoCapitalize="none" />
      <TextField label={editing ? t('auth.keepClientSecret', { defaultValue: 'Client secret (blank keeps existing)' }) : t('auth.clientSecret', { defaultValue: 'Client secret' })} value={form.client_secret} onChangeText={client_secret => setForm(f => ({ ...f, client_secret }))} secureTextEntry autoCapitalize="none" />
      <TextField label={t('auth.scopes', { defaultValue: 'Scopes' })} value={form.scopes ?? ''} onChangeText={scopes => setForm(f => ({ ...f, scopes }))} autoCapitalize="none" />
      <TextField label={t('auth.iconUrl', { defaultValue: 'Icon URL (HTTPS)' })} value={form.icon_url ?? ''} onChangeText={icon_url => setForm(f => ({ ...f, icon_url: icon_url || null }))} autoCapitalize="none" />
      <SwitchRow label={t('auth.providerEnabled', { defaultValue: 'Provider enabled' })} value={form.is_enabled ?? true} onValueChange={is_enabled => setForm(f => ({ ...f, is_enabled }))} />
      <SwitchRow label={t('auth.autoCreateUsers', { defaultValue: 'Automatically create users' })} value={form.auto_create_users ?? false} onValueChange={auto_create_users => setForm(f => ({ ...f, auto_create_users }))} />
      <SwitchRow label={t('auth.linkExistingAccounts', { defaultValue: 'Link existing accounts by email' })} value={form.auto_link_existing_accounts ?? false} onValueChange={auto_link_existing_accounts => setForm(f => ({ ...f, auto_link_existing_accounts }))} />
      <SwitchRow label={t('auth.requireVerifiedEmail', { defaultValue: 'Require verified email' })} value={form.require_email_verified ?? true} onValueChange={require_email_verified => setForm(f => ({ ...f, require_email_verified }))} />
      <SwitchRow label={t('auth.autologinProvider', { defaultValue: 'Automatic sign-in provider' })} description={t('auth.autologinProviderHint', { defaultValue: 'Only one provider can be automatic. The server clears any previous choice.' })} value={form.is_autologin ?? false} onValueChange={is_autologin => setForm(f => ({ ...f, is_autologin }))} />
      <TextField label={t('auth.emailClaim', { defaultValue: 'Email claim' })} value={form.email_claim ?? 'email'} onChangeText={email_claim => setForm(f => ({ ...f, email_claim }))} autoCapitalize="none" />
      <TextField label={t('auth.groupClaim', { defaultValue: 'Group claim' })} value={form.group_claim ?? 'groups'} onChangeText={group_claim => setForm(f => ({ ...f, group_claim }))} autoCapitalize="none" />
      <OptionChipsField disabled={!canReadGroups} label={t('auth.defaultGroup', { defaultValue: 'Default local group' })} value={String(form.default_group_id ?? '')} options={[{ key: '', get label() { return translateNative('common.none', { defaultValue: 'None' }); } }, ...(groups.data ?? []).map(g => ({ key: String(g.id), label: g.name }))]} onChange={value => setForm(f => ({ ...f, default_group_id: value ? Number(value) : null }))} />
      {groups.isError ? <><Text style={{ color: colors.error }}>{groups.error.message}</Text><PrimaryButton label={t('auth.retryGroups', { defaultValue: 'Retry groups' })} onPress={() => void groups.refetch()} /></> : null}
      <Text style={{ color: colors.textSecondary }}>{t('auth.groupMappingHint', { defaultValue: 'Group mappings synchronize local membership at sign-in. An empty list disables synchronization.' })}</Text>
      {mappings.map((row, index) => <View key={index} style={styles.mapping}>
        <TextField editable={canReadGroups} label={t('auth.externalGroup', { defaultValue: 'Identity-provider group {{number}}', number: index + 1 })} value={row.external} onChangeText={external => setMappings(rows => rows.map((r, i) => i === index ? { ...r, external } : r))} autoCapitalize="none" />
        <OptionChipsField disabled={!canReadGroups} label={t('auth.localGroup', { defaultValue: 'Local group' })} value={row.local} options={(groups.data ?? []).map(g => ({ key: g.name, label: g.name }))} onChange={local => setMappings(rows => rows.map((r, i) => i === index ? { ...r, local } : r))} />
        <PrimaryButton disabled={!canReadGroups} label={t('auth.removeMapping', { defaultValue: 'Remove mapping {{number}}', number: index + 1 })} variant="danger" onPress={() => setMappings(rows => rows.filter((_, i) => i !== index))} />
      </View>)}
      <PrimaryButton label={t('auth.addGroupMapping', { defaultValue: 'Add group mapping' })} variant="secondary" disabled={!canReadGroups} onPress={() => setMappings(rows => [...rows, { external: '', local: '' }])} />
      <PrimaryButton label={t('auth.saveProvider', { defaultValue: 'Save provider' })} disabled={save.isPending || (canReadGroups && !groups.data)} onPress={() => save.mutate()} />
      <PrimaryButton label={t('auth.cancelProviderEdit', { defaultValue: 'Cancel provider edit' })} variant="secondary" disabled={save.isPending} onPress={() => { setEditing(undefined); setForm(DEFAULT); setMessage(''); }} />
    </> : <>
      <PrimaryButton label={t('auth.addProvider', { defaultValue: 'Add provider' })} variant="secondary" onPress={() => open(null)} />
      {query.isLoading ? <Text style={{ color: colors.textSecondary }}>{t('auth.loadingProviders', { defaultValue: 'Loading providers…' })}</Text> : null}
      {query.data?.map(provider => <View key={provider.id} style={styles.mapping}>
        {provider.has_icon ? <Image source={{ uri: providerIconUrl(provider.id, query.dataUpdatedAt) }} style={styles.icon} /> : null}
        <Text style={{ color: colors.text }}>{provider.name} • {provider.is_enabled ? translateNative('native.6786e575ee872370') : translateNative('native.08e76ba2b69926c4')}{provider.is_autologin ? translateNative('native.d8e92debd3520a6f') : ''}</Text>
        <Text style={{ color: colors.textSecondary }}>{provider.issuer_url} • {provider.scopes}</Text>
        {provider.is_env_managed ? <Text style={{ color: colors.textSecondary }}>{t('auth.environmentManaged', { defaultValue: 'Managed by server environment configuration (read-only).' })}</Text> : null}
        <PrimaryButton label={t('auth.editProvider', { defaultValue: 'Edit {{provider}}', provider: provider.name })} variant="secondary" disabled={provider.is_env_managed} onPress={() => open(provider)} />
        <PrimaryButton label={t('auth.refreshProviderIcon', { defaultValue: 'Refresh {{provider}} icon', provider: provider.name })} variant="secondary" disabled={action.isPending || provider.is_env_managed || !provider.icon_url} onPress={() => action.mutate({ provider, kind: 'refresh' })} />
        <PrimaryButton label={t('auth.removeProviderIcon', { defaultValue: 'Remove {{provider}} icon', provider: provider.name })} variant="secondary" disabled={action.isPending || provider.is_env_managed || !provider.has_icon} onPress={() => action.mutate({ provider, kind: 'remove' })} />
        <PrimaryButton label={t('auth.deleteProvider', { defaultValue: 'Delete {{provider}}', provider: provider.name })} variant="danger" disabled={action.isPending || provider.is_env_managed} onPress={() => Alert.alert(t('auth.deleteProviderConfirm', { defaultValue: 'Delete provider?' }), t('auth.deleteProviderWarning', { defaultValue: '{{provider}} will no longer be available for sign-in.', provider: provider.name }), [
          { get text() { return translateNative('common.cancel'); }, style: 'cancel' }, { get text() { return translateNative('common.delete'); }, style: 'destructive', onPress: () => action.mutate({ provider, kind: 'delete' }) },
        ])} />
      </View>)}
      {query.data?.length === 0 ? <Text style={{ color: colors.textSecondary }}>{t('auth.noProviders', { defaultValue: 'No providers configured.' })}</Text> : null}
    </>}
  </SectionCard>;
}
const styles = StyleSheet.create({ mapping: { gap: spacing.sm, paddingVertical: spacing.md }, icon: { width: 40, height: 40 } });
