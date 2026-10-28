import { NativeTranslation, translateNative, useNativeLocale, useTranslation } from '@/i18n';

import Clipboard from '@react-native-clipboard/clipboard';
import React from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { RootNavigationProp } from '@/navigation/types';
import { InlineTabBar, PrimaryButton, SectionCard, TextField } from '@/components/common/AppUI';
import { SMTP_SECURITY_OPTIONS } from './constants';
import { OptionChipsField, settingsStyles, SwitchRow, stringifyNumberField } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';
import { AccountSecurityControls, EncryptionStatusPanel } from './AccountSecurityControls';
import { ScopedApiKeysManager } from './ScopedApiKeysManager';
import { ConnectedAppsManager } from './ConnectedAppsManager';
import { OIDCProvidersManager } from './OIDCProvidersManager';
import { useAuth } from '@/contexts/AuthContext';

export function UsersSecuritySection({ controller }: { controller: SettingsScreenController }) {
  useNativeLocale();
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const navigation = useNavigation<RootNavigationProp<'Settings'>>();
  const { userPanel, draft, smtpForm, smtpTestEmail, ldapForm, backupCodes, emailSetupToken, emailSetupCode } = controller.state;
  const { setUserPanel, setDraft, setSmtpForm, setSmtpTestEmail, setLdapForm, setShowTOTPRegen, setShowTOTPDisable, setShowTOTPSetup, setShowDisableEmail2FA, setEmailSetupToken, setEmailSetupCode } = controller.actions;
  const { advancedAuth, ldapStatus, twoFAStatus, securityRows } = controller.derived;
  const { oidcLinksQuery } = controller.queries;
  const {
    toggleAdvancedAuthMutation,
    saveSMTPMutation,
    testSMTPMutation,
    toggleLDAPMutation,
    saveLDAPMutation,
    testLDAPMutation,
    enableEmailOTPRequestMutation,
    confirmEnableEmailOTPMutation,
    unlinkOIDCLinkMutation,
  } = controller.mutations;

  return (
    <>
      <AccountSecurityControls />
      <EncryptionStatusPanel />
      <SectionCard title={translateNative('native.213a026ec62c5e14')} subtitle={translateNative('native.85dc99456786d76d')}>
        <InlineTabBar
          value={userPanel}
          tabs={[
            { key: 'auth', get label() { return translateNative('native.9cb1595ecce006ea'); } },
            { key: 'email', label: 'SMTP' },
            { key: 'ldap', label: 'LDAP' },
            { key: 'oidc', label: 'OIDC' },
            { key: 'twofa', label: '2FA' },
          ]}
          onChange={value => setUserPanel(value as typeof userPanel)}
        />
        {!hasPermission('settings:update') && userPanel !== 'twofa' ? <Text style={[settingsStyles.helper, { color: controller.colors.warning }]}>{t('auth.sharedSettingsPermission', { defaultValue: 'Shared authentication settings require settings:update permission.' })}</Text> : null}
      </SectionCard>

      {userPanel === 'auth' ? (
        <>
          <SectionCard title={translateNative('native.96f3fdacaaca172a')} subtitle={translateNative('native.5618bf69d777d46f')}>
            <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>{translateNative('native.947dddbae12f3639')}{advancedAuth?.advanced_auth_enabled ? translateNative('native.6786e575ee872370') : translateNative('native.08e76ba2b69926c4')} {translateNative('native.b79899bd847c7737')}{advancedAuth?.smtp_configured ? translateNative('native.69d469e78de0ce33', { defaultValue: 'yes' }) : translateNative('native.294fae9b9ab07565', { defaultValue: 'no' })}</Text>
            <SwitchRow label={translateNative('native.863c3b66fb26e7b3')} description={translateNative('native.ab45a5f3e3aa12fb')} value={Boolean(draft.local_login_enabled ?? advancedAuth?.local_login_enabled ?? true)} onValueChange={value => setDraft(current => ({ ...current, local_login_enabled: value }))} disabled={!controller.permissions.canManageSecurity} />
            <TextField label={translateNative('native.fb83d7144bf24af5')} value={stringifyNumberField(draft.session_max_hours, '24')} onChangeText={value => setDraft(current => ({ ...current, session_max_hours: Number(value) || 24 }))} keyboardType="number-pad" editable={controller.permissions.canManageSecurity} />
            <SwitchRow label={translateNative('native.1ca0c23b92ee5d64')} description={translateNative('native.167e04b30e781ecd')} value={Boolean(draft.user_notifications_enabled ?? true)} onValueChange={value => setDraft(current => ({ ...current, user_notifications_enabled: value }))} disabled={!controller.permissions.canManageSecurity} />
            {hasPermission('users:read') ? <PrimaryButton label={translateNative('native.78a56c6c3bedc5f0')} variant="secondary" onPress={() => navigation.navigate('Users')} /> : null}
          </SectionCard>
          <ScopedApiKeysManager />
          <ConnectedAppsManager />
          <SectionCard title={translateNative('native.22d3fedabdfb21e7')} subtitle={translateNative('native.30fa578450d38599')}>
            {securityRows.map(row => (
              <View key={row.label} style={settingsStyles.summaryRow}>
                <Text style={[settingsStyles.summaryLabel, { color: controller.colors.textSecondary }]}>{row.label}</Text>
                <Text style={[settingsStyles.summaryValue, { color: controller.colors.text }]}>{row.value}</Text>
              </View>
            ))}
          </SectionCard>
        </>
      ) : null}

      {userPanel === 'email' ? (
        <>
          <SectionCard title={translateNative('native.6868ad9c10e8f54f')} subtitle={translateNative('native.f4c44ce6c688c249')}>
            <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>{translateNative('native.79236fcebf0a8b1d')}{advancedAuth?.advanced_auth_enabled ? translateNative('native.6786e575ee872370') : translateNative('native.08e76ba2b69926c4')}</Text>
            <PrimaryButton
              label={toggleAdvancedAuthMutation.isPending ? translateNative('native.2f062a3481054e2f') : advancedAuth?.advanced_auth_enabled ? translateNative('native.fab9ae8be7fcc706') : translateNative('native.ad3730358b848a91')}
              variant={advancedAuth?.advanced_auth_enabled ? 'danger' : 'primary'}
              onPress={() => void toggleAdvancedAuthMutation.mutateAsync(!(advancedAuth?.advanced_auth_enabled ?? false))}
              disabled={!controller.permissions.canManageSecurity || toggleAdvancedAuthMutation.isPending}
              loading={toggleAdvancedAuthMutation.isPending}
            />
          </SectionCard>
          <SectionCard title={translateNative('native.f02b38ed8ef5ad31')} subtitle={translateNative('native.7e4988d87ee22a40')}>
            <SwitchRow label={translateNative('native.051c8870b3731298')} description={translateNative('native.a175b4261be43bf7')} value={smtpForm.smtp_auth_enabled} onValueChange={value => setSmtpForm(current => ({ ...current, smtp_auth_enabled: value, ...(value ? {} : { smtp_username: '', smtp_password: '' }) }))} disabled={!controller.permissions.canManageSecurity} />
            <TextField label={translateNative('native.b23bad3b8a96dbc7')} value={smtpForm.smtp_host} onChangeText={value => setSmtpForm(current => ({ ...current, smtp_host: value }))} autoCapitalize="none" editable={controller.permissions.canManageSecurity} />
            <TextField label={translateNative('native.ec879c19b8bf18ce')} value={String(smtpForm.smtp_port)} onChangeText={value => setSmtpForm(current => ({ ...current, smtp_port: Number(value) || controller.derived.smtpPortBySecurity[current.smtp_security] }))} keyboardType="number-pad" editable={controller.permissions.canManageSecurity} />
            <OptionChipsField label={translateNative('native.8bf268572a77759a')} value={smtpForm.smtp_security} options={SMTP_SECURITY_OPTIONS} onChange={value => setSmtpForm(current => ({ ...current, smtp_security: value, smtp_port: controller.derived.smtpPortBySecurity[value] }))} disabled={!controller.permissions.canManageSecurity} />
            <TextField label={translateNative('native.f503af8b2bf430e6')} value={smtpForm.smtp_username ?? ''} onChangeText={value => setSmtpForm(current => ({ ...current, smtp_username: value }))} autoCapitalize="none" editable={controller.permissions.canManageSecurity && smtpForm.smtp_auth_enabled} />
            <TextField label={translateNative('native.08c9c68cc706272f')} value={smtpForm.smtp_password ?? ''} onChangeText={value => setSmtpForm(current => ({ ...current, smtp_password: value }))} secureTextEntry editable={controller.permissions.canManageSecurity && smtpForm.smtp_auth_enabled} />
            <TextField label={translateNative('native.ea65cae677a415f1')} value={smtpForm.smtp_from_email} onChangeText={value => setSmtpForm(current => ({ ...current, smtp_from_email: value }))} keyboardType="email-address" autoCapitalize="none" editable={controller.permissions.canManageSecurity} />
            <TextField label={translateNative('native.96410dcb669fc512')} value={smtpForm.smtp_from_name} onChangeText={value => setSmtpForm(current => ({ ...current, smtp_from_name: value }))} editable={controller.permissions.canManageSecurity} />
            <View style={settingsStyles.actions}>
              <PrimaryButton label={saveSMTPMutation.isPending ? translateNative('native.018c2002806e2312') : translateNative('native.3fd2eb21762555ca')} onPress={controller.actions.handleSaveSMTP} loading={saveSMTPMutation.isPending} disabled={!controller.permissions.canManageSecurity || saveSMTPMutation.isPending} />
            </View>
          </SectionCard>
          <SectionCard title={translateNative('native.f57e5f5ef846315d')} subtitle={translateNative('native.ae8da542849e0e09')}>
            <TextField label={translateNative('native.7d97f6fcefa52656')} value={smtpTestEmail} onChangeText={setSmtpTestEmail} keyboardType="email-address" autoCapitalize="none" />
            <PrimaryButton label={testSMTPMutation.isPending ? translateNative('native.503088c268f2c987') : translateNative('native.b3d6dd33f6a8d404')} variant="secondary" onPress={() => void testSMTPMutation.mutateAsync(smtpTestEmail.trim())} disabled={!smtpTestEmail.trim() || testSMTPMutation.isPending} loading={testSMTPMutation.isPending} />
          </SectionCard>
        </>
      ) : null}

      {userPanel === 'ldap' ? (
        <>
          <SectionCard title={translateNative('native.f1149f15495acb06')} subtitle={translateNative('native.567348744f66b6cf')}>
            <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>{translateNative('native.3806665daa25859c')}{ldapStatus?.ldap_configured ? translateNative('native.69d469e78de0ce33', { defaultValue: 'yes' }) : translateNative('native.294fae9b9ab07565', { defaultValue: 'no' })} {translateNative('native.7dd90d1dfce19f36')}{ldapStatus?.ldap_enabled ? translateNative('native.69d469e78de0ce33', { defaultValue: 'yes' }) : translateNative('native.294fae9b9ab07565', { defaultValue: 'no' })}</Text>
            <SwitchRow label={translateNative('native.cfefcac846fc64da')} description={translateNative('native.b7d2fdac56ede98a')} value={ldapStatus?.ldap_enabled ?? false} onValueChange={value => void toggleLDAPMutation.mutateAsync(value)} disabled={!controller.permissions.canManageSecurity || toggleLDAPMutation.isPending} />
          </SectionCard>
          <SectionCard title={translateNative('native.9c58c73c1979079b')} subtitle={translateNative('native.aae61d3812265663')}>
            <TextField label={translateNative('native.301fd81a82ae3258')} value={ldapForm.ldap_server_url} onChangeText={value => setLdapForm(current => ({ ...current, ldap_server_url: value }))} autoCapitalize="none" editable={controller.permissions.canManageSecurity} />
            <OptionChipsField label={translateNative('native.8bf268572a77759a')} value={ldapForm.ldap_security} options={[{ key: 'starttls', label: 'STARTTLS' }, { key: 'ldaps', get label() { return translateNative('native.bb023e40cd127e5d'); } }]} onChange={value => setLdapForm(current => ({ ...current, ldap_security: value }))} disabled={!controller.permissions.canManageSecurity} />
            <TextField label={translateNative('native.46a260124d8a3bed')} value={ldapForm.ldap_bind_dn} onChangeText={value => setLdapForm(current => ({ ...current, ldap_bind_dn: value }))} autoCapitalize="none" editable={controller.permissions.canManageSecurity} />
            <TextField label={translateNative('native.26841861b82c4826')} value={ldapForm.ldap_bind_password} onChangeText={value => setLdapForm(current => ({ ...current, ldap_bind_password: value }))} secureTextEntry editable={controller.permissions.canManageSecurity} />
            <TextField label={translateNative('native.8d9b85ed083c5934')} value={ldapForm.ldap_search_base} onChangeText={value => setLdapForm(current => ({ ...current, ldap_search_base: value }))} autoCapitalize="none" editable={controller.permissions.canManageSecurity} />
            <TextField label={translateNative('native.9f499e5009c76fd9')} value={ldapForm.ldap_user_filter} onChangeText={value => setLdapForm(current => ({ ...current, ldap_user_filter: value }))} autoCapitalize="none" editable={controller.permissions.canManageSecurity} />
            <TextField label={translateNative('native.0fba91f01bde71ec')} value={ldapForm.ldap_group_mapping} onChangeText={value => setLdapForm(current => ({ ...current, ldap_group_mapping: value }))} multiline editable={controller.permissions.canManageSecurity} />
            <TextField label={translateNative('native.c8965d4d055d14e2')} value={ldapForm.ldap_default_group} onChangeText={value => setLdapForm(current => ({ ...current, ldap_default_group: value }))} editable={controller.permissions.canManageSecurity} />
            <SwitchRow label={translateNative('native.5c5a2396297f8b6e')} description={translateNative('native.188701309bac013c')} value={ldapForm.ldap_auto_provision} onValueChange={value => setLdapForm(current => ({ ...current, ldap_auto_provision: value }))} disabled={!controller.permissions.canManageSecurity} />
            <View style={settingsStyles.actions}>
              <PrimaryButton label={saveLDAPMutation.isPending ? translateNative('native.018c2002806e2312') : translateNative('native.0450f6da7fdbd6dc')} onPress={controller.actions.handleSaveLDAP} loading={saveLDAPMutation.isPending} disabled={!controller.permissions.canManageSecurity || saveLDAPMutation.isPending} />
              <PrimaryButton label={testLDAPMutation.isPending ? translateNative('native.36b1241a43893d02') : translateNative('native.c281bbb20123f577')} variant="secondary" onPress={() => void testLDAPMutation.mutateAsync()} loading={testLDAPMutation.isPending} disabled={!controller.permissions.canManageSecurity || testLDAPMutation.isPending} />
            </View>
          </SectionCard>
        </>
      ) : null}

      {userPanel === 'oidc' ? (
        <OIDCProvidersManager />
      ) : null}

      {userPanel === 'twofa' ? (
        <>
          <SectionCard title={translateNative('native.08be8bde90093a29')} subtitle={translateNative('native.bf01ca91ea0b2240')}>
            <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>{translateNative('native.296de758fca0458a')}</Text>
          </SectionCard>
          <SectionCard title={translateNative('native.fdbc3d0d8d6688f3')} subtitle={translateNative('native.c29237dd124d6bc3')}>
            <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>{translateNative('native.79236fcebf0a8b1d')}{twoFAStatus?.totp_enabled ? translateNative('native.6786e575ee872370') : translateNative('native.08e76ba2b69926c4')}</Text>
            {twoFAStatus?.totp_enabled ? (
              <>
                <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}><NativeTranslation id="native.cc3eac106f0073ae" values={{ value0: (twoFAStatus.backup_codes_remaining) }} /></Text>
                <View style={settingsStyles.actions}>
                  <PrimaryButton label={translateNative('native.09a2cb83a0a5c570')} variant="secondary" onPress={() => setShowTOTPRegen(true)} />
                  <PrimaryButton label={translateNative('native.a19c6ed345084af7')} variant="danger" onPress={() => setShowTOTPDisable(true)} />
                </View>
              </>
            ) : (
              <PrimaryButton label={translateNative('native.6e20be355da15baa')} onPress={() => setShowTOTPSetup(true)} />
            )}
          </SectionCard>
          <SectionCard title={translateNative('native.182fa6e8ec453311')} subtitle={translateNative('native.2b1be8c47bf7aeef')}>
            <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>{translateNative('native.75786c8f6127aaeb')}{controller.user?.email || translateNative('native.24d35f1843053bf8')} {translateNative('native.5954bd6a332dd627')}{twoFAStatus?.email_otp_enabled ? translateNative('native.6786e575ee872370') : translateNative('native.08e76ba2b69926c4')}</Text>
            {emailSetupToken ? (
              <>
                <TextField label={translateNative('native.c137dc7718a985e1')} value={emailSetupCode} onChangeText={setEmailSetupCode} keyboardType="number-pad" />
                <View style={settingsStyles.actions}>
                  <PrimaryButton label={translateNative('common.cancel')} variant="secondary" onPress={() => { setEmailSetupToken(null); setEmailSetupCode(''); }} />
                  <PrimaryButton label={confirmEnableEmailOTPMutation.isPending ? translateNative('native.5c1bf88a5cba056e') : translateNative('native.d82b64d4121d9f86')} onPress={() => emailSetupToken && void confirmEnableEmailOTPMutation.mutateAsync({ token: emailSetupToken, code: emailSetupCode })} disabled={emailSetupCode.trim().length !== 6 || confirmEnableEmailOTPMutation.isPending} loading={confirmEnableEmailOTPMutation.isPending} />
                </View>
              </>
            ) : twoFAStatus?.email_otp_enabled ? (
              <PrimaryButton label={translateNative('native.29d07eb6f3774a6b')} variant="danger" onPress={() => setShowDisableEmail2FA(true)} />
            ) : (
              <PrimaryButton label={enableEmailOTPRequestMutation.isPending ? translateNative('native.de1f76fe147ed1c8') : translateNative('native.529b32d63f6b6c3d')} onPress={() => void enableEmailOTPRequestMutation.mutateAsync()} disabled={!controller.user?.email || enableEmailOTPRequestMutation.isPending} loading={enableEmailOTPRequestMutation.isPending} />
            )}
          </SectionCard>
          {(oidcLinksQuery.data ?? []).length > 0 ? (
            <SectionCard title={translateNative('native.ed1f6856839100fd')} subtitle={translateNative('native.3f1149ed5832d409')}>
              {oidcLinksQuery.data?.map(link => (
                <View key={link.id} style={[settingsStyles.itemCard, { backgroundColor: controller.colors.surfaceElevated, borderColor: controller.colors.border }]}> 
                  <View style={settingsStyles.itemHeader}>
                    <View style={settingsStyles.itemText}>
                      <Text style={[settingsStyles.itemTitle, { color: controller.colors.text }]}>{link.provider_name}</Text>
                      <Text style={[settingsStyles.itemMeta, { color: controller.colors.textSecondary }]}>{link.provider_email || translateNative('native.1ea6c7478b64fd1e')}</Text>
                    </View>
                    <PrimaryButton label={translateNative('native.4b6b182ce709b1ec')} variant="danger" onPress={() => void unlinkOIDCLinkMutation.mutateAsync(link.provider_id)} loading={unlinkOIDCLinkMutation.isPending} disabled={unlinkOIDCLinkMutation.isPending} />
                  </View>
                </View>
              ))}
            </SectionCard>
          ) : null}
          {backupCodes.length > 0 ? (
            <SectionCard title={translateNative('native.64e043e56bf5c59f')} subtitle={translateNative('native.1e8678c0910117b6')}>
              <View style={settingsStyles.codeGrid}>
                {backupCodes.map(code => (
                  <View key={code} style={[settingsStyles.codeCard, { backgroundColor: controller.colors.surfaceElevated, borderColor: controller.colors.border }]}> 
                    <Text style={[settingsStyles.codeText, { color: controller.colors.text }]}>{code}</Text>
                  </View>
                ))}
              </View>
              <PrimaryButton
                label={translateNative('native.c085a8f4d8472ef9')}
                variant="secondary"
                onPress={() => {
                  Clipboard.setString(backupCodes.join('\n'));
                  controller.actions.showToast(translateNative('native.09df16ef022f5a4b'), 'success');
                }}
              />
            </SectionCard>
          ) : null}
        </>
      ) : null}
    </>
  );
}
