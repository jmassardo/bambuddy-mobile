import Clipboard from '@react-native-clipboard/clipboard';
import React from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { RootNavigationProp } from '@/navigation/types';
import { InlineTabBar, PrimaryButton, SectionCard, StatusBadge, TextField } from '@/components/common/AppUI';
import { EmptyState } from '@/components/common/StateScreens';
import { SMTP_SECURITY_OPTIONS } from './constants';
import { OptionChipsField, settingsStyles, SwitchRow, stringifyNumberField } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';

export function UsersSecuritySection({ controller }: { controller: SettingsScreenController }) {
  const navigation = useNavigation<RootNavigationProp<'Settings'>>();
  const { userPanel, draft, smtpForm, smtpTestEmail, ldapForm, backupCodes, emailSetupToken, emailSetupCode } = controller.state;
  const { setUserPanel, setDraft, setSmtpForm, setSmtpTestEmail, setLdapForm, setShowTOTPRegen, setShowTOTPDisable, setShowTOTPSetup, setShowDisableEmail2FA, setEmailSetupToken, setEmailSetupCode } = controller.actions;
  const { advancedAuth, ldapStatus, twoFAStatus, securityRows } = controller.derived;
  const { oidcProvidersQuery, oidcLinksQuery } = controller.queries;
  const {
    toggleAdvancedAuthMutation,
    saveSMTPMutation,
    testSMTPMutation,
    toggleLDAPMutation,
    saveLDAPMutation,
    testLDAPMutation,
    updateOIDCProviderMutation,
    enableEmailOTPRequestMutation,
    confirmEnableEmailOTPMutation,
    unlinkOIDCLinkMutation,
  } = controller.mutations;

  return (
    <>
      <SectionCard title="Users & security" subtitle="Authentication, SMTP, LDAP, OIDC, and 2FA for the current account.">
        <InlineTabBar
          value={userPanel}
          tabs={[
            { key: 'auth', label: 'Auth' },
            { key: 'email', label: 'SMTP' },
            { key: 'ldap', label: 'LDAP' },
            { key: 'oidc', label: 'OIDC' },
            { key: 'twofa', label: '2FA' },
          ]}
          onChange={value => setUserPanel(value as typeof userPanel)}
        />
        {!controller.isAdmin && userPanel !== 'twofa' ? <Text style={[settingsStyles.helper, { color: controller.colors.warning }]}>Admin rights are required to change shared authentication settings.</Text> : null}
      </SectionCard>

      {userPanel === 'auth' ? (
        <>
          <SectionCard title="Authentication" subtitle="Session policy, local login, and advanced auth status.">
            <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>Advanced auth: {advancedAuth?.advanced_auth_enabled ? 'enabled' : 'disabled'} • SMTP configured: {advancedAuth?.smtp_configured ? 'yes' : 'no'}</Text>
            <SwitchRow label="Local login enabled" description="Allow username/password logins alongside SSO." value={Boolean(draft.local_login_enabled ?? advancedAuth?.local_login_enabled ?? true)} onValueChange={value => setDraft(current => ({ ...current, local_login_enabled: value }))} disabled={!controller.permissions.canManageSecurity} />
            <TextField label="Session max hours" value={stringifyNumberField(draft.session_max_hours, '24')} onChangeText={value => setDraft(current => ({ ...current, session_max_hours: Number(value) || 24 }))} keyboardType="number-pad" editable={controller.permissions.canManageSecurity} />
            <SwitchRow label="User email notifications" description="Enable email delivery for user-level events." value={Boolean(draft.user_notifications_enabled ?? true)} onValueChange={value => setDraft(current => ({ ...current, user_notifications_enabled: value }))} disabled={!controller.permissions.canManageSecurity} />
            <PrimaryButton label="Open user management" variant="secondary" onPress={() => navigation.navigate('Users')} />
          </SectionCard>
          <SectionCard title="Security status" subtitle="Current security posture and recent account activity.">
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
          <SectionCard title="Advanced authentication" subtitle="Email-driven password reset and invite flow.">
            <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>Status: {advancedAuth?.advanced_auth_enabled ? 'enabled' : 'disabled'}</Text>
            <PrimaryButton
              label={toggleAdvancedAuthMutation.isPending ? 'Updating…' : advancedAuth?.advanced_auth_enabled ? 'Disable advanced auth' : 'Enable advanced auth'}
              variant={advancedAuth?.advanced_auth_enabled ? 'danger' : 'primary'}
              onPress={() => void toggleAdvancedAuthMutation.mutateAsync(!(advancedAuth?.advanced_auth_enabled ?? false))}
              disabled={!controller.permissions.canManageSecurity || toggleAdvancedAuthMutation.isPending}
              loading={toggleAdvancedAuthMutation.isPending}
            />
          </SectionCard>
          <SectionCard title="SMTP configuration" subtitle="Server, port, TLS, credentials, and sender settings.">
            <SwitchRow label="SMTP authentication" description="Disable when your mail server does not require a username/password." value={smtpForm.smtp_auth_enabled} onValueChange={value => setSmtpForm(current => ({ ...current, smtp_auth_enabled: value, ...(value ? {} : { smtp_username: '', smtp_password: '' }) }))} disabled={!controller.permissions.canManageSecurity} />
            <TextField label="SMTP host" value={smtpForm.smtp_host} onChangeText={value => setSmtpForm(current => ({ ...current, smtp_host: value }))} autoCapitalize="none" editable={controller.permissions.canManageSecurity} />
            <TextField label="SMTP port" value={String(smtpForm.smtp_port)} onChangeText={value => setSmtpForm(current => ({ ...current, smtp_port: Number(value) || controller.derived.smtpPortBySecurity[current.smtp_security] }))} keyboardType="number-pad" editable={controller.permissions.canManageSecurity} />
            <OptionChipsField label="Security" value={smtpForm.smtp_security} options={SMTP_SECURITY_OPTIONS} onChange={value => setSmtpForm(current => ({ ...current, smtp_security: value, smtp_port: controller.derived.smtpPortBySecurity[value] }))} disabled={!controller.permissions.canManageSecurity} />
            <TextField label="Username" value={smtpForm.smtp_username ?? ''} onChangeText={value => setSmtpForm(current => ({ ...current, smtp_username: value }))} autoCapitalize="none" editable={controller.permissions.canManageSecurity && smtpForm.smtp_auth_enabled} />
            <TextField label="Password" value={smtpForm.smtp_password ?? ''} onChangeText={value => setSmtpForm(current => ({ ...current, smtp_password: value }))} secureTextEntry editable={controller.permissions.canManageSecurity && smtpForm.smtp_auth_enabled} />
            <TextField label="From address" value={smtpForm.smtp_from_email} onChangeText={value => setSmtpForm(current => ({ ...current, smtp_from_email: value }))} keyboardType="email-address" autoCapitalize="none" editable={controller.permissions.canManageSecurity} />
            <TextField label="From name" value={smtpForm.smtp_from_name} onChangeText={value => setSmtpForm(current => ({ ...current, smtp_from_name: value }))} editable={controller.permissions.canManageSecurity} />
            <View style={settingsStyles.actions}>
              <PrimaryButton label={saveSMTPMutation.isPending ? 'Saving…' : 'Save SMTP settings'} onPress={controller.actions.handleSaveSMTP} loading={saveSMTPMutation.isPending} disabled={!controller.permissions.canManageSecurity || saveSMTPMutation.isPending} />
            </View>
          </SectionCard>
          <SectionCard title="Test email" subtitle="Send a test message with the current SMTP settings.">
            <TextField label="Recipient email" value={smtpTestEmail} onChangeText={setSmtpTestEmail} keyboardType="email-address" autoCapitalize="none" />
            <PrimaryButton label={testSMTPMutation.isPending ? 'Sending…' : 'Send test email'} variant="secondary" onPress={() => void testSMTPMutation.mutateAsync(smtpTestEmail.trim())} disabled={!smtpTestEmail.trim() || testSMTPMutation.isPending} loading={testSMTPMutation.isPending} />
          </SectionCard>
        </>
      ) : null}

      {userPanel === 'ldap' ? (
        <>
          <SectionCard title="LDAP status" subtitle="Enable or disable directory authentication.">
            <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>Configured: {ldapStatus?.ldap_configured ? 'yes' : 'no'} • Enabled: {ldapStatus?.ldap_enabled ? 'yes' : 'no'}</Text>
            <SwitchRow label="LDAP enabled" description="Turn on LDAP login once the server details below are valid." value={ldapStatus?.ldap_enabled ?? false} onValueChange={value => void toggleLDAPMutation.mutateAsync(value)} disabled={!controller.permissions.canManageSecurity || toggleLDAPMutation.isPending} />
          </SectionCard>
          <SectionCard title="LDAP server" subtitle="Connection, bind credentials, search base, and filters.">
            <TextField label="Server URL" value={ldapForm.ldap_server_url} onChangeText={value => setLdapForm(current => ({ ...current, ldap_server_url: value }))} autoCapitalize="none" editable={controller.permissions.canManageSecurity} />
            <OptionChipsField label="Security" value={ldapForm.ldap_security} options={[{ key: 'starttls', label: 'STARTTLS' }, { key: 'ldaps', label: 'LDAPS' }]} onChange={value => setLdapForm(current => ({ ...current, ldap_security: value }))} disabled={!controller.permissions.canManageSecurity} />
            <TextField label="Bind DN" value={ldapForm.ldap_bind_dn} onChangeText={value => setLdapForm(current => ({ ...current, ldap_bind_dn: value }))} autoCapitalize="none" editable={controller.permissions.canManageSecurity} />
            <TextField label="Bind password" value={ldapForm.ldap_bind_password} onChangeText={value => setLdapForm(current => ({ ...current, ldap_bind_password: value }))} secureTextEntry editable={controller.permissions.canManageSecurity} />
            <TextField label="Base DN" value={ldapForm.ldap_search_base} onChangeText={value => setLdapForm(current => ({ ...current, ldap_search_base: value }))} autoCapitalize="none" editable={controller.permissions.canManageSecurity} />
            <TextField label="User filter" value={ldapForm.ldap_user_filter} onChangeText={value => setLdapForm(current => ({ ...current, ldap_user_filter: value }))} autoCapitalize="none" editable={controller.permissions.canManageSecurity} />
            <TextField label="Group mapping (JSON)" value={ldapForm.ldap_group_mapping} onChangeText={value => setLdapForm(current => ({ ...current, ldap_group_mapping: value }))} multiline editable={controller.permissions.canManageSecurity} />
            <TextField label="Default group" value={ldapForm.ldap_default_group} onChangeText={value => setLdapForm(current => ({ ...current, ldap_default_group: value }))} editable={controller.permissions.canManageSecurity} />
            <SwitchRow label="Auto-provision users" description="Create a Bambuddy account on first successful LDAP login." value={ldapForm.ldap_auto_provision} onValueChange={value => setLdapForm(current => ({ ...current, ldap_auto_provision: value }))} disabled={!controller.permissions.canManageSecurity} />
            <View style={settingsStyles.actions}>
              <PrimaryButton label={saveLDAPMutation.isPending ? 'Saving…' : 'Save LDAP settings'} onPress={controller.actions.handleSaveLDAP} loading={saveLDAPMutation.isPending} disabled={!controller.permissions.canManageSecurity || saveLDAPMutation.isPending} />
              <PrimaryButton label={testLDAPMutation.isPending ? 'Testing…' : 'Test connection'} variant="secondary" onPress={() => void testLDAPMutation.mutateAsync()} loading={testLDAPMutation.isPending} disabled={!controller.permissions.canManageSecurity || testLDAPMutation.isPending} />
            </View>
          </SectionCard>
        </>
      ) : null}

      {userPanel === 'oidc' ? (
        <>
          <SectionCard title="OIDC providers" subtitle="Configured single sign-on providers and their client credentials.">
            <PrimaryButton label="Add provider" variant="secondary" onPress={() => controller.actions.openProviderModal()} disabled={!controller.permissions.canManageSecurity} />
          </SectionCard>
          {(oidcProvidersQuery.data ?? []).length > 0 ? (
            oidcProvidersQuery.data?.map(provider => (
              <SectionCard key={provider.id} title={provider.name} subtitle={provider.issuer_url} right={<StatusBadge label={provider.is_enabled ? 'enabled' : 'disabled'} color={provider.is_enabled ? controller.colors.success : controller.colors.textTertiary} />}>
                <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>Client ID: {provider.client_id}</Text>
                <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>Scope: {provider.scopes}</Text>
                <SwitchRow label="Enabled" value={provider.is_enabled} onValueChange={value => void updateOIDCProviderMutation.mutateAsync({ id: provider.id, payload: { is_enabled: value } })} disabled={!controller.permissions.canManageSecurity || updateOIDCProviderMutation.isPending} />
                <View style={settingsStyles.actions}>
                  <PrimaryButton label="Edit" variant="secondary" onPress={() => controller.actions.openProviderModal(provider)} disabled={!controller.permissions.canManageSecurity} />
                  <PrimaryButton label="Delete" variant="danger" onPress={() => controller.actions.setProviderDeleteTarget(provider)} disabled={!controller.permissions.canManageSecurity} />
                </View>
              </SectionCard>
            ))
          ) : (
            <EmptyState icon="🌐" title="No OIDC providers" message="Add an issuer to configure mobile-visible SSO settings." />
          )}
        </>
      ) : null}

      {userPanel === 'twofa' ? (
        <>
          <SectionCard title="2FA policy" subtitle="Per-account 2FA setup for the currently signed-in user.">
            <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>The current API exposes TOTP and email 2FA per user. A global enforcement toggle is not available in this server version.</Text>
          </SectionCard>
          <SectionCard title="Authenticator app (TOTP)" subtitle="Set up or disable authenticator-based codes.">
            <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>Status: {twoFAStatus?.totp_enabled ? 'enabled' : 'disabled'}</Text>
            {twoFAStatus?.totp_enabled ? (
              <>
                <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>Backup codes remaining: {twoFAStatus.backup_codes_remaining}</Text>
                <View style={settingsStyles.actions}>
                  <PrimaryButton label="Regenerate backup codes" variant="secondary" onPress={() => setShowTOTPRegen(true)} />
                  <PrimaryButton label="Disable TOTP" variant="danger" onPress={() => setShowTOTPDisable(true)} />
                </View>
              </>
            ) : (
              <PrimaryButton label="Set up TOTP" onPress={() => setShowTOTPSetup(true)} />
            )}
          </SectionCard>
          <SectionCard title="Email 2FA" subtitle="One-time codes sent to your account email.">
            <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>Email: {controller.user?.email || 'No email on account'} • Status: {twoFAStatus?.email_otp_enabled ? 'enabled' : 'disabled'}</Text>
            {emailSetupToken ? (
              <>
                <TextField label="Verification code" value={emailSetupCode} onChangeText={setEmailSetupCode} keyboardType="number-pad" />
                <View style={settingsStyles.actions}>
                  <PrimaryButton label="Cancel" variant="secondary" onPress={() => { setEmailSetupToken(null); setEmailSetupCode(''); }} />
                  <PrimaryButton label={confirmEnableEmailOTPMutation.isPending ? 'Verifying…' : 'Verify and enable'} onPress={() => emailSetupToken && void confirmEnableEmailOTPMutation.mutateAsync({ token: emailSetupToken, code: emailSetupCode })} disabled={emailSetupCode.trim().length !== 6 || confirmEnableEmailOTPMutation.isPending} loading={confirmEnableEmailOTPMutation.isPending} />
                </View>
              </>
            ) : twoFAStatus?.email_otp_enabled ? (
              <PrimaryButton label="Disable email 2FA" variant="danger" onPress={() => setShowDisableEmail2FA(true)} />
            ) : (
              <PrimaryButton label={enableEmailOTPRequestMutation.isPending ? 'Sending code…' : 'Enable email 2FA'} onPress={() => void enableEmailOTPRequestMutation.mutateAsync()} disabled={!controller.user?.email || enableEmailOTPRequestMutation.isPending} loading={enableEmailOTPRequestMutation.isPending} />
            )}
          </SectionCard>
          {(oidcLinksQuery.data ?? []).length > 0 ? (
            <SectionCard title="Linked SSO accounts" subtitle="Accounts linked to your user for sign-in.">
              {oidcLinksQuery.data?.map(link => (
                <View key={link.id} style={[settingsStyles.itemCard, { backgroundColor: controller.colors.surfaceElevated, borderColor: controller.colors.border }]}> 
                  <View style={settingsStyles.itemHeader}>
                    <View style={settingsStyles.itemText}>
                      <Text style={[settingsStyles.itemTitle, { color: controller.colors.text }]}>{link.provider_name}</Text>
                      <Text style={[settingsStyles.itemMeta, { color: controller.colors.textSecondary }]}>{link.provider_email || 'Linked account'}</Text>
                    </View>
                    <PrimaryButton label="Unlink" variant="danger" onPress={() => void unlinkOIDCLinkMutation.mutateAsync(link.provider_id)} loading={unlinkOIDCLinkMutation.isPending} disabled={unlinkOIDCLinkMutation.isPending} />
                  </View>
                </View>
              ))}
            </SectionCard>
          ) : null}
          {backupCodes.length > 0 ? (
            <SectionCard title="Backup codes" subtitle="Store these somewhere safe. They are shown only after setup or regeneration.">
              <View style={settingsStyles.codeGrid}>
                {backupCodes.map(code => (
                  <View key={code} style={[settingsStyles.codeCard, { backgroundColor: controller.colors.surfaceElevated, borderColor: controller.colors.border }]}> 
                    <Text style={[settingsStyles.codeText, { color: controller.colors.text }]}>{code}</Text>
                  </View>
                ))}
              </View>
              <PrimaryButton
                label="Copy backup codes"
                variant="secondary"
                onPress={() => {
                  Clipboard.setString(backupCodes.join('\n'));
                  controller.actions.showToast('Backup codes copied.', 'success');
                }}
              />
            </SectionCard>
          ) : null}
        </>
      ) : null}
    </>
  );
}
