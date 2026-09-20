import Clipboard from '@react-native-clipboard/clipboard';
import React from 'react';
import { ActivityIndicator, Image, ScrollView, Text, View } from 'react-native';
import { AlertModal } from '@/components/common/AlertModal';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { PrimaryButton, TextField } from '@/components/common/AppUI';
import { EMPTY_SMART_PLUG_FORM, EXTERNAL_CAMERA_TYPE_OPTIONS, SMART_PLUG_TYPE_OPTIONS } from './constants';
import { OptionChipsField, settingsStyles, SimpleModal, SwitchRow } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';
import type { SmartPlugType } from './types';
import { pickNumber, pickString } from '@/utils/data';

export function SettingsModals({ controller }: { controller: SettingsScreenController }) {
  const {
    createdCameraToken,
    providerModalVisible,
    editingProvider,
    providerForm,
    plugModalVisible,
    editingPlug,
    plugForm,
    externalLinkModalVisible,
    externalLinkForm,
    editingExternalLink,
    customNavModalVisible,
    editingCustomNav,
    customNavForm,
    externalCameraModalVisible,
    editingExternalCamera,
    externalCameraForm,
    pendingDeleteExternalCamera,
    virtualPrinterModalVisible,
    editingVirtualPrinter,
    virtualPrinterForm,
    showTOTPSetup,
    totpCode,
    showTOTPDisable,
    totpDisableCode,
    showTOTPRegen,
    totpRegenCode,
    showDisableEmail2FA,
    emailDisablePassword,
    providerDeleteTarget,
    plugDeleteTarget,
    pendingDeleteExternalLink,
    pendingDeleteVirtualPrinter,
    locationModalVisible,
    editingLocation,
    locationForm,
    pendingDeleteLocation,
  } = controller.state;

  const { actions, mutations, queries } = controller;

  return (
    <>
      <SimpleModal visible={providerModalVisible} title={editingProvider ? 'Edit OIDC provider' : 'Add OIDC provider'} subtitle="Provider name, issuer URL, client credentials, scope, and enabled state." onClose={actions.closeProviderModal}>
        <ScrollView contentContainerStyle={settingsStyles.modalBody}>
          <TextField label="Name" value={providerForm.name} onChangeText={value => actions.setProviderForm(current => ({ ...current, name: value }))} />
          <TextField label="Issuer URL" value={providerForm.issuer_url} onChangeText={value => actions.setProviderForm(current => ({ ...current, issuer_url: value }))} autoCapitalize="none" />
          <TextField label="Client ID" value={providerForm.client_id} onChangeText={value => actions.setProviderForm(current => ({ ...current, client_id: value }))} autoCapitalize="none" />
          <TextField label="Client secret" value={providerForm.client_secret} onChangeText={value => actions.setProviderForm(current => ({ ...current, client_secret: value }))} secureTextEntry placeholder={editingProvider ? 'Leave blank to keep current secret' : undefined} autoCapitalize="none" />
          <TextField label="Scope" value={providerForm.scopes} onChangeText={value => actions.setProviderForm(current => ({ ...current, scopes: value }))} autoCapitalize="none" />
          <SwitchRow label="Enabled" value={providerForm.is_enabled} onValueChange={value => actions.setProviderForm(current => ({ ...current, is_enabled: value }))} />
          <View style={settingsStyles.modalFooter}>
            <PrimaryButton label="Cancel" variant="secondary" onPress={actions.closeProviderModal} />
            <PrimaryButton
              label={editingProvider ? (mutations.updateOIDCProviderMutation.isPending ? 'Saving…' : 'Save provider') : (mutations.createOIDCProviderMutation.isPending ? 'Creating…' : 'Create provider')}
              onPress={actions.handleProviderSave}
              loading={mutations.createOIDCProviderMutation.isPending || mutations.updateOIDCProviderMutation.isPending}
              disabled={mutations.createOIDCProviderMutation.isPending || mutations.updateOIDCProviderMutation.isPending}
            />
          </View>
        </ScrollView>
      </SimpleModal>

      <SimpleModal visible={plugModalVisible} title={editingPlug ? 'Edit smart plug' : 'Add smart plug'} subtitle="Name, connection details, type, and basic on/off behavior." onClose={actions.closePlugModal}>
        <ScrollView contentContainerStyle={settingsStyles.modalBody}>
          <TextField label="Name" value={plugForm.name} onChangeText={value => actions.setPlugForm(current => ({ ...current, name: value }))} />
          <OptionChipsField label="Plug type" value={plugForm.plug_type} options={SMART_PLUG_TYPE_OPTIONS} onChange={value => actions.setPlugForm(current => ({ ...EMPTY_SMART_PLUG_FORM, ...current, plug_type: value as SmartPlugType }))} />
          {plugForm.plug_type === 'tasmota' ? (
            <>
              <TextField label="IP address" value={plugForm.ip_address} onChangeText={value => actions.setPlugForm(current => ({ ...current, ip_address: value }))} autoCapitalize="none" />
              <TextField label="Username" value={plugForm.username} onChangeText={value => actions.setPlugForm(current => ({ ...current, username: value }))} autoCapitalize="none" />
              <TextField label="Password" value={plugForm.password} onChangeText={value => actions.setPlugForm(current => ({ ...current, password: value }))} secureTextEntry placeholder={editingPlug ? 'Leave blank to keep current password' : undefined} />
            </>
          ) : null}
          {plugForm.plug_type === 'homeassistant' ? <TextField label="Entity ID" value={plugForm.ha_entity_id} onChangeText={value => actions.setPlugForm(current => ({ ...current, ha_entity_id: value }))} autoCapitalize="none" /> : null}
          {plugForm.plug_type === 'mqtt' ? (
            <>
              <TextField label="Power topic" value={plugForm.mqtt_power_topic} onChangeText={value => actions.setPlugForm(current => ({ ...current, mqtt_power_topic: value }))} autoCapitalize="none" />
              <TextField label="State topic" value={plugForm.mqtt_state_topic} onChangeText={value => actions.setPlugForm(current => ({ ...current, mqtt_state_topic: value }))} autoCapitalize="none" />
            </>
          ) : null}
          {plugForm.plug_type === 'rest' ? (
            <>
              <TextField label="Power on URL" value={plugForm.rest_on_url} onChangeText={value => actions.setPlugForm(current => ({ ...current, rest_on_url: value }))} autoCapitalize="none" />
              <TextField label="Power off URL" value={plugForm.rest_off_url} onChangeText={value => actions.setPlugForm(current => ({ ...current, rest_off_url: value }))} autoCapitalize="none" />
            </>
          ) : null}
          <SwitchRow label="Enabled" value={plugForm.enabled} onValueChange={value => actions.setPlugForm(current => ({ ...current, enabled: value }))} />
          <View style={settingsStyles.modalFooter}>
            <PrimaryButton label="Cancel" variant="secondary" onPress={actions.closePlugModal} />
            <PrimaryButton
              label={editingPlug ? (mutations.updateSmartPlugMutation.isPending ? 'Saving…' : 'Save plug') : (mutations.createSmartPlugMutation.isPending ? 'Creating…' : 'Create plug')}
              onPress={actions.handlePlugSave}
              loading={mutations.createSmartPlugMutation.isPending || mutations.updateSmartPlugMutation.isPending}
              disabled={mutations.createSmartPlugMutation.isPending || mutations.updateSmartPlugMutation.isPending}
            />
          </View>
        </ScrollView>
      </SimpleModal>

      <SimpleModal visible={externalLinkModalVisible} title={editingExternalLink ? 'Edit external link' : 'Add external link'} subtitle="Name, destination URL, and whether it should open externally." onClose={actions.closeExternalLinkModal}>
        <ScrollView contentContainerStyle={settingsStyles.modalBody}>
          <TextField label="Name" value={externalLinkForm.name} onChangeText={value => actions.setExternalLinkForm(current => ({ ...current, name: value }))} />
          <TextField label="URL" value={externalLinkForm.url} onChangeText={value => actions.setExternalLinkForm(current => ({ ...current, url: value }))} autoCapitalize="none" />
          <TextField label="Icon" value={externalLinkForm.icon} onChangeText={value => actions.setExternalLinkForm(current => ({ ...current, icon: value }))} autoCapitalize="none" placeholder="link" />
          <SwitchRow label="Open in new tab" value={externalLinkForm.open_in_new_tab} onValueChange={value => actions.setExternalLinkForm(current => ({ ...current, open_in_new_tab: value }))} />
          <TextField label="Sort order" value={externalLinkForm.sort_order} onChangeText={value => actions.setExternalLinkForm(current => ({ ...current, sort_order: value }))} keyboardType="number-pad" />
          <View style={settingsStyles.modalFooter}>
            <PrimaryButton label="Cancel" variant="secondary" onPress={actions.closeExternalLinkModal} />
            <PrimaryButton
              label={editingExternalLink ? (mutations.updateExternalLinkMutation.isPending ? 'Saving…' : 'Save link') : (mutations.createExternalLinkMutation.isPending ? 'Creating…' : 'Create link')}
              onPress={actions.handleSaveExternalLink}
              loading={mutations.createExternalLinkMutation.isPending || mutations.updateExternalLinkMutation.isPending}
              disabled={mutations.createExternalLinkMutation.isPending || mutations.updateExternalLinkMutation.isPending}
            />
          </View>
        </ScrollView>
      </SimpleModal>

      <SimpleModal visible={customNavModalVisible} title={editingCustomNav ? 'Edit custom link' : 'Add custom link'} subtitle="Create a navigation link that appears in your custom navigation menu." onClose={actions.closeCustomNavModal}>
        <ScrollView contentContainerStyle={settingsStyles.modalBody}>
          <TextField label="Name" value={customNavForm.name} onChangeText={value => actions.setCustomNavForm(current => ({ ...current, name: value }))} />
          <TextField label="URL" value={customNavForm.url} onChangeText={value => actions.setCustomNavForm(current => ({ ...current, url: value }))} autoCapitalize="none" placeholder="https://example.com" />
          <TextField label="Icon" value={customNavForm.icon} onChangeText={value => actions.setCustomNavForm(current => ({ ...current, icon: value }))} autoCapitalize="none" placeholder="link" />
          <SwitchRow label="Open in new tab" value={customNavForm.open_in_new_tab} onValueChange={value => actions.setCustomNavForm(current => ({ ...current, open_in_new_tab: value }))} />
          <View style={settingsStyles.modalFooter}>
            <PrimaryButton label="Cancel" variant="secondary" onPress={actions.closeCustomNavModal} />
            <PrimaryButton
              label={mutations.saveCustomNavMutation.isPending ? 'Saving…' : 'Save link'}
              onPress={actions.handleSaveCustomNav}
              loading={mutations.saveCustomNavMutation.isPending}
              disabled={mutations.saveCustomNavMutation.isPending}
            />
          </View>
        </ScrollView>
      </SimpleModal>

      <SimpleModal visible={virtualPrinterModalVisible} title={editingVirtualPrinter ? 'Edit virtual printer' : 'Create virtual printer'} subtitle="Name, printer model, serial number, and enabled state." onClose={actions.closeVirtualPrinterModal}>
        <ScrollView contentContainerStyle={settingsStyles.modalBody}>
          <TextField label="Name" value={virtualPrinterForm.name} onChangeText={value => actions.setVirtualPrinterForm(current => ({ ...current, name: value }))} />
          <OptionChipsField label="Model" value={virtualPrinterForm.model_name} options={controller.derived.virtualPrinterModels} onChange={value => actions.setVirtualPrinterForm(current => ({ ...current, model_name: value }))} />
          <TextField label="Custom model" value={virtualPrinterForm.model_name} onChangeText={value => actions.setVirtualPrinterForm(current => ({ ...current, model_name: value }))} />
          <TextField label="Serial number" value={virtualPrinterForm.serial_number} onChangeText={value => actions.setVirtualPrinterForm(current => ({ ...current, serial_number: value }))} autoCapitalize="characters" />
          <SwitchRow label="Enabled" value={virtualPrinterForm.enabled} onValueChange={value => actions.setVirtualPrinterForm(current => ({ ...current, enabled: value }))} />
          <View style={settingsStyles.modalFooter}>
            <PrimaryButton label="Cancel" variant="secondary" onPress={actions.closeVirtualPrinterModal} />
            <PrimaryButton label={editingVirtualPrinter ? (mutations.saveVirtualPrinterMutation.isPending ? 'Saving…' : 'Save printer') : (mutations.saveVirtualPrinterMutation.isPending ? 'Creating…' : 'Create printer')} onPress={actions.handleSaveVirtualPrinter} loading={mutations.saveVirtualPrinterMutation.isPending} disabled={mutations.saveVirtualPrinterMutation.isPending} />
          </View>
        </ScrollView>
      </SimpleModal>

      <AlertModal visible={Boolean(createdCameraToken)} variant="success" title="Camera token created" message={createdCameraToken || 'Your new camera token is ready.'} dismissLabel="OK" onClose={() => actions.setCreatedCameraToken('')} />

      <SimpleModal visible={showTOTPSetup} title="Set up TOTP" subtitle="Scan the QR code, then enter the 6-digit code from your authenticator app." onClose={() => { actions.setShowTOTPSetup(false); actions.queryClient.removeQueries({ queryKey: ['totp-setup'] }); actions.setTotpCode(''); }}>
        <View style={settingsStyles.modalBody}>
          {queries.totpSetupQuery.isLoading ? (
            <ActivityIndicator size="large" color={controller.colors.accent} />
          ) : queries.totpSetupQuery.data ? (
            <>
              <Image source={{ uri: `data:image/png;base64,${queries.totpSetupQuery.data.qr_code_b64}` }} style={settingsStyles.qrImage} />
              <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>Secret: {queries.totpSetupQuery.data.secret}</Text>
              <PrimaryButton label="Copy secret" variant="secondary" onPress={() => { Clipboard.setString(queries.totpSetupQuery.data?.secret ?? ''); actions.showToast('TOTP secret copied.', 'success'); }} />
              <TextField label="Verification code" value={totpCode} onChangeText={actions.setTotpCode} keyboardType="number-pad" />
              <PrimaryButton label={mutations.enableTOTPMutation.isPending ? 'Enabling…' : 'Enable TOTP'} onPress={() => void mutations.enableTOTPMutation.mutateAsync(totpCode)} disabled={totpCode.trim().length !== 6 || mutations.enableTOTPMutation.isPending} loading={mutations.enableTOTPMutation.isPending} />
            </>
          ) : (
            <Text style={[settingsStyles.helper, { color: controller.colors.error }]}>Unable to load a TOTP setup challenge.</Text>
          )}
        </View>
      </SimpleModal>

      <SimpleModal visible={showTOTPDisable} title="Disable TOTP" subtitle="Enter a current authenticator or backup code to confirm." onClose={() => { actions.setShowTOTPDisable(false); actions.setTotpDisableCode(''); }}>
        <View style={settingsStyles.modalBody}>
          <TextField label="Code" value={totpDisableCode} onChangeText={actions.setTotpDisableCode} autoCapitalize="characters" />
          <View style={settingsStyles.modalFooter}>
            <PrimaryButton label="Cancel" variant="secondary" onPress={() => { actions.setShowTOTPDisable(false); actions.setTotpDisableCode(''); }} />
            <PrimaryButton label={mutations.disableTOTPMutation.isPending ? 'Disabling…' : 'Disable TOTP'} variant="danger" onPress={() => void mutations.disableTOTPMutation.mutateAsync(totpDisableCode)} disabled={totpDisableCode.trim().length < 6 || mutations.disableTOTPMutation.isPending} loading={mutations.disableTOTPMutation.isPending} />
          </View>
        </View>
      </SimpleModal>

      <SimpleModal visible={showTOTPRegen} title="Regenerate backup codes" subtitle="Enter a current authenticator or backup code to continue." onClose={() => { actions.setShowTOTPRegen(false); actions.setTotpRegenCode(''); }}>
        <View style={settingsStyles.modalBody}>
          <TextField label="Code" value={totpRegenCode} onChangeText={actions.setTotpRegenCode} autoCapitalize="characters" />
          <View style={settingsStyles.modalFooter}>
            <PrimaryButton label="Cancel" variant="secondary" onPress={() => { actions.setShowTOTPRegen(false); actions.setTotpRegenCode(''); }} />
            <PrimaryButton label={mutations.regenerateBackupCodesMutation.isPending ? 'Generating…' : 'Generate codes'} onPress={() => void mutations.regenerateBackupCodesMutation.mutateAsync(totpRegenCode)} disabled={totpRegenCode.trim().length < 6 || mutations.regenerateBackupCodesMutation.isPending} loading={mutations.regenerateBackupCodesMutation.isPending} />
          </View>
        </View>
      </SimpleModal>

      <SimpleModal visible={showDisableEmail2FA} title="Disable email 2FA" subtitle="Enter your account password to remove email-based one-time codes." onClose={() => { actions.setShowDisableEmail2FA(false); actions.setEmailDisablePassword(''); }}>
        <View style={settingsStyles.modalBody}>
          <TextField label="Password" value={emailDisablePassword} onChangeText={actions.setEmailDisablePassword} secureTextEntry />
          <View style={settingsStyles.modalFooter}>
            <PrimaryButton label="Cancel" variant="secondary" onPress={() => { actions.setShowDisableEmail2FA(false); actions.setEmailDisablePassword(''); }} />
            <PrimaryButton label={mutations.disableEmailOTPMutation.isPending ? 'Disabling…' : 'Disable email 2FA'} variant="danger" onPress={() => void mutations.disableEmailOTPMutation.mutateAsync(emailDisablePassword)} disabled={!emailDisablePassword.trim() || mutations.disableEmailOTPMutation.isPending} loading={mutations.disableEmailOTPMutation.isPending} />
          </View>
        </View>
      </SimpleModal>

      <ConfirmModal visible={providerDeleteTarget !== null} title="Delete OIDC provider" message={providerDeleteTarget ? `Delete ${providerDeleteTarget.name}?` : 'Delete this provider?'} confirmLabel="Delete" onClose={() => actions.setProviderDeleteTarget(null)} onConfirm={() => providerDeleteTarget && void mutations.deleteOIDCProviderMutation.mutateAsync(providerDeleteTarget.id)} loading={mutations.deleteOIDCProviderMutation.isPending} />

      <ConfirmModal visible={plugDeleteTarget !== null} title="Delete smart plug" message={plugDeleteTarget ? `Delete ${plugDeleteTarget.name}?` : 'Delete this smart plug?'} confirmLabel="Delete" onClose={() => actions.setPlugDeleteTarget(null)} onConfirm={() => plugDeleteTarget && void mutations.deleteSmartPlugMutation.mutateAsync(plugDeleteTarget.id)} loading={mutations.deleteSmartPlugMutation.isPending} />

      <ConfirmModal visible={pendingDeleteExternalLink !== null} title="Delete external link" message={pendingDeleteExternalLink ? `Delete ${pickString(pendingDeleteExternalLink, ['name'], 'this link')}?` : 'Delete this external link?'} confirmLabel="Delete" onClose={() => actions.setPendingDeleteExternalLink(null)} onConfirm={() => pendingDeleteExternalLink && void mutations.deleteExternalLinkMutation.mutateAsync(pickNumber(pendingDeleteExternalLink, ['id']))} loading={mutations.deleteExternalLinkMutation.isPending} />

      <ConfirmModal visible={pendingDeleteVirtualPrinter !== null} title="Delete virtual printer" message={pendingDeleteVirtualPrinter ? `Delete ${pickString(pendingDeleteVirtualPrinter, ['name'], 'this virtual printer')}?` : 'Delete this virtual printer?'} confirmLabel="Delete" onClose={() => actions.setPendingDeleteVirtualPrinter(null)} onConfirm={() => pendingDeleteVirtualPrinter && void mutations.deleteVirtualPrinterMutation.mutateAsync(pickNumber(pendingDeleteVirtualPrinter, ['id']))} loading={mutations.deleteVirtualPrinterMutation.isPending} />

      <SimpleModal visible={externalCameraModalVisible} title={editingExternalCamera ? 'Edit external camera' : 'Add external camera'} subtitle="Camera name, stream URL (RTSP/HTTP), type, and optional printer mapping." onClose={actions.closeExternalCameraModal}>
        <ScrollView contentContainerStyle={settingsStyles.modalBody}>
          <TextField label="Name" value={externalCameraForm.name} onChangeText={value => actions.setExternalCameraForm(current => ({ ...current, name: value }))} />
          <TextField label="Stream URL" value={externalCameraForm.stream_url} onChangeText={value => actions.setExternalCameraForm(current => ({ ...current, stream_url: value }))} autoCapitalize="none" placeholder="rtsp:// or http:// or https:// URL" />
          <OptionChipsField label="Camera type" value={externalCameraForm.camera_type} options={EXTERNAL_CAMERA_TYPE_OPTIONS} onChange={value => actions.setExternalCameraForm(current => ({ ...current, camera_type: value }))} />
          <OptionChipsField label="Printer" value={externalCameraForm.printer_id} options={controller.derived.printerOptions} onChange={value => actions.setExternalCameraForm(current => ({ ...current, printer_id: value }))} />
          <View style={settingsStyles.modalFooter}>
            <PrimaryButton label="Cancel" variant="secondary" onPress={actions.closeExternalCameraModal} />
            <PrimaryButton label={mutations.createExternalCameraMutation.isPending || mutations.updateExternalCameraMutation.isPending ? 'Saving…' : 'Save camera'} onPress={actions.handleSaveExternalCamera} loading={mutations.createExternalCameraMutation.isPending || mutations.updateExternalCameraMutation.isPending} disabled={mutations.createExternalCameraMutation.isPending || mutations.updateExternalCameraMutation.isPending} />
          </View>
        </ScrollView>
      </SimpleModal>

      <ConfirmModal visible={pendingDeleteExternalCamera !== null} title="Delete external camera" message={pendingDeleteExternalCamera ? `Delete ${pickString(pendingDeleteExternalCamera, ['name'], 'this external camera')}?` : 'Delete this external camera?'} confirmLabel="Delete" onClose={() => actions.setPendingDeleteExternalCamera(null)} onConfirm={() => pendingDeleteExternalCamera && void mutations.deleteExternalCameraMutation.mutateAsync(pickNumber(pendingDeleteExternalCamera, ['id']))} loading={mutations.deleteExternalCameraMutation.isPending} />

      <SimpleModal visible={locationModalVisible} title={editingLocation ? 'Edit storage location' : 'Add storage location'} subtitle="Location name, optional identifier, address, and notes for organizing filament spools." onClose={actions.closeLocationModal}>
        <ScrollView contentContainerStyle={settingsStyles.modalBody}>
          <TextField label="Name" value={locationForm.name} onChangeText={value => actions.setLocationForm(current => ({ ...current, name: value }))} placeholder="Shelf A" />
          <TextField label="Identifier" value={locationForm.identifier} onChangeText={value => actions.setLocationForm(current => ({ ...current, identifier: value }))} placeholder="A-1" />
          <TextField label="Address / Location details" value={locationForm.address} onChangeText={value => actions.setLocationForm(current => ({ ...current, address: value }))} placeholder="Garage, left wall" />
          <TextField label="Notes" value={locationForm.notes} onChangeText={value => actions.setLocationForm(current => ({ ...current, notes: value }))} multiline placeholder="Any additional notes about this location" />
          <View style={settingsStyles.modalFooter}>
            <PrimaryButton label="Cancel" variant="secondary" onPress={actions.closeLocationModal} />
            <PrimaryButton
              label={editingLocation ? (mutations.updateLocationMutation.isPending ? 'Saving…' : 'Save location') : (mutations.createLocationMutation.isPending ? 'Creating…' : 'Create location')}
              onPress={actions.handleSaveLocation}
              loading={mutations.createLocationMutation.isPending || mutations.updateLocationMutation.isPending}
              disabled={mutations.createLocationMutation.isPending || mutations.updateLocationMutation.isPending}
            />
          </View>
        </ScrollView>
      </SimpleModal>

      <ConfirmModal visible={pendingDeleteLocation !== null} title="Delete storage location" message={pendingDeleteLocation ? `Delete ${pendingDeleteLocation.name}? Locations with assigned spools cannot be removed.` : 'Delete this storage location?'} confirmLabel="Delete" onClose={() => actions.setPendingDeleteLocation(null)} onConfirm={() => pendingDeleteLocation && void mutations.deleteLocationMutation.mutateAsync(pendingDeleteLocation.id)} loading={mutations.deleteLocationMutation.isPending} />
    </>
  );
}
