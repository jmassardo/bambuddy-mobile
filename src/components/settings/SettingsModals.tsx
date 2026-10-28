import { NativeTranslation, translateNative, useNativeLocale } from '@/i18n';

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
  useNativeLocale();
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
      <SimpleModal visible={providerModalVisible} title={editingProvider ? translateNative('native.635d8b37daf0ae69') : translateNative('native.cf0dcfe39449197e')} subtitle={translateNative('native.e8ed69f15dd7a895')} onClose={actions.closeProviderModal}>
        <ScrollView contentContainerStyle={settingsStyles.modalBody}>
          <TextField label={translateNative('common.name')} value={providerForm.name} onChangeText={value => actions.setProviderForm(current => ({ ...current, name: value }))} />
          <TextField label={translateNative('native.a4fa4ef57f74cdd9')} value={providerForm.issuer_url} onChangeText={value => actions.setProviderForm(current => ({ ...current, issuer_url: value }))} autoCapitalize="none" />
          <TextField label={translateNative('native.c66e40e9330690db')} value={providerForm.client_id} onChangeText={value => actions.setProviderForm(current => ({ ...current, client_id: value }))} autoCapitalize="none" />
          <TextField label={translateNative('native.19a0a81dd0ffeec5')} value={providerForm.client_secret} onChangeText={value => actions.setProviderForm(current => ({ ...current, client_secret: value }))} secureTextEntry placeholder={editingProvider ? translateNative('native.ef5d2dd309722316') : undefined} autoCapitalize="none" />
          <TextField label={translateNative('native.f06349a7cd34d358')} value={providerForm.scopes} onChangeText={value => actions.setProviderForm(current => ({ ...current, scopes: value }))} autoCapitalize="none" />
          <SwitchRow label={translateNative('common.enabled')} value={providerForm.is_enabled} onValueChange={value => actions.setProviderForm(current => ({ ...current, is_enabled: value }))} />
          <View style={settingsStyles.modalFooter}>
            <PrimaryButton label={translateNative('common.cancel')} variant="secondary" onPress={actions.closeProviderModal} />
            <PrimaryButton
              label={editingProvider ? (mutations.updateOIDCProviderMutation.isPending ? translateNative('native.018c2002806e2312') : translateNative('native.20d9e393977e0e6d')) : (mutations.createOIDCProviderMutation.isPending ? translateNative('native.b762dfbcd3d9c0d7') : translateNative('native.b5bc2f6fdda812f3'))}
              onPress={actions.handleProviderSave}
              loading={mutations.createOIDCProviderMutation.isPending || mutations.updateOIDCProviderMutation.isPending}
              disabled={mutations.createOIDCProviderMutation.isPending || mutations.updateOIDCProviderMutation.isPending}
            />
          </View>
        </ScrollView>
      </SimpleModal>

      <SimpleModal visible={plugModalVisible} title={editingPlug ? translateNative('native.5cd26aa23babdad4') : translateNative('native.5f6128ede25edfd8')} subtitle={translateNative('native.92fd7d5cd941ea1a')} onClose={actions.closePlugModal}>
        <ScrollView contentContainerStyle={settingsStyles.modalBody}>
          <TextField label={translateNative('common.name')} value={plugForm.name} onChangeText={value => actions.setPlugForm(current => ({ ...current, name: value }))} />
          <OptionChipsField label={translateNative('native.463699cf4d88af54')} value={plugForm.plug_type} options={SMART_PLUG_TYPE_OPTIONS} onChange={value => actions.setPlugForm(current => ({ ...EMPTY_SMART_PLUG_FORM, ...current, plug_type: value as SmartPlugType }))} />
          {plugForm.plug_type === 'tasmota' ? (
            <>
              <TextField label={translateNative('native.034a6032919bb741')} value={plugForm.ip_address} onChangeText={value => actions.setPlugForm(current => ({ ...current, ip_address: value }))} autoCapitalize="none" />
              <TextField label={translateNative('native.f503af8b2bf430e6')} value={plugForm.username} onChangeText={value => actions.setPlugForm(current => ({ ...current, username: value }))} autoCapitalize="none" />
              <TextField label={translateNative('native.08c9c68cc706272f')} value={plugForm.password} onChangeText={value => actions.setPlugForm(current => ({ ...current, password: value }))} secureTextEntry placeholder={editingPlug ? translateNative('native.fbbb3b02aac765bf') : undefined} />
            </>
          ) : null}
          {plugForm.plug_type === 'homeassistant' ? <TextField label={translateNative('native.568ad3d2f206b784')} value={plugForm.ha_entity_id} onChangeText={value => actions.setPlugForm(current => ({ ...current, ha_entity_id: value }))} autoCapitalize="none" /> : null}
          {plugForm.plug_type === 'mqtt' ? (
            <>
              <TextField label={translateNative('native.dc9288374f24a5cc')} value={plugForm.mqtt_power_topic} onChangeText={value => actions.setPlugForm(current => ({ ...current, mqtt_power_topic: value }))} autoCapitalize="none" />
              <TextField label={translateNative('native.67f34db4b6915e4b')} value={plugForm.mqtt_state_topic} onChangeText={value => actions.setPlugForm(current => ({ ...current, mqtt_state_topic: value }))} autoCapitalize="none" />
            </>
          ) : null}
          {plugForm.plug_type === 'rest' ? (
            <>
              <TextField label={translateNative('native.80566d3e311a45d3')} value={plugForm.rest_on_url} onChangeText={value => actions.setPlugForm(current => ({ ...current, rest_on_url: value }))} autoCapitalize="none" />
              <TextField label={translateNative('native.c0aa34c2deb27a2a')} value={plugForm.rest_off_url} onChangeText={value => actions.setPlugForm(current => ({ ...current, rest_off_url: value }))} autoCapitalize="none" />
            </>
          ) : null}
          <SwitchRow label={translateNative('common.enabled')} value={plugForm.enabled} onValueChange={value => actions.setPlugForm(current => ({ ...current, enabled: value }))} />
          <View style={settingsStyles.modalFooter}>
            <PrimaryButton label={translateNative('common.cancel')} variant="secondary" onPress={actions.closePlugModal} />
            <PrimaryButton
              label={editingPlug ? (mutations.updateSmartPlugMutation.isPending ? translateNative('native.018c2002806e2312') : translateNative('native.507db9f111c793b4')) : (mutations.createSmartPlugMutation.isPending ? translateNative('native.b762dfbcd3d9c0d7') : translateNative('native.883d41b1e7973902'))}
              onPress={actions.handlePlugSave}
              loading={mutations.createSmartPlugMutation.isPending || mutations.updateSmartPlugMutation.isPending}
              disabled={mutations.createSmartPlugMutation.isPending || mutations.updateSmartPlugMutation.isPending}
            />
          </View>
        </ScrollView>
      </SimpleModal>

      <SimpleModal visible={externalLinkModalVisible} title={editingExternalLink ? translateNative('native.9bee9615e48fec8a') : translateNative('native.7cc3338c074adb7f')} subtitle={translateNative('native.6e3570993a3c7836')} onClose={actions.closeExternalLinkModal}>
        <ScrollView contentContainerStyle={settingsStyles.modalBody}>
          <TextField label={translateNative('common.name')} value={externalLinkForm.name} onChangeText={value => actions.setExternalLinkForm(current => ({ ...current, name: value }))} />
          <TextField label="URL" value={externalLinkForm.url} onChangeText={value => actions.setExternalLinkForm(current => ({ ...current, url: value }))} autoCapitalize="none" />
          <TextField label={translateNative('native.4f06c4d9aa3ba07c')} value={externalLinkForm.icon} onChangeText={value => actions.setExternalLinkForm(current => ({ ...current, icon: value }))} autoCapitalize="none" placeholder={translateNative('native.211865a156c7910b')} />
          <SwitchRow label={translateNative('native.fdb05a52ca12b23c')} value={externalLinkForm.open_in_new_tab} onValueChange={value => actions.setExternalLinkForm(current => ({ ...current, open_in_new_tab: value }))} />
          <TextField label={translateNative('native.7b209e16efe1dbf2')} value={externalLinkForm.sort_order} onChangeText={value => actions.setExternalLinkForm(current => ({ ...current, sort_order: value }))} keyboardType="number-pad" />
          <View style={settingsStyles.modalFooter}>
            <PrimaryButton label={translateNative('common.cancel')} variant="secondary" onPress={actions.closeExternalLinkModal} />
            <PrimaryButton
              label={editingExternalLink ? (mutations.updateExternalLinkMutation.isPending ? translateNative('native.018c2002806e2312') : translateNative('native.9204ea00e121ca1d')) : (mutations.createExternalLinkMutation.isPending ? translateNative('native.b762dfbcd3d9c0d7') : translateNative('native.a1827362dbd7a910'))}
              onPress={actions.handleSaveExternalLink}
              loading={mutations.createExternalLinkMutation.isPending || mutations.updateExternalLinkMutation.isPending}
              disabled={mutations.createExternalLinkMutation.isPending || mutations.updateExternalLinkMutation.isPending}
            />
          </View>
        </ScrollView>
      </SimpleModal>

      <SimpleModal visible={customNavModalVisible} title={editingCustomNav ? translateNative('native.9ce2f6270de7d5e3') : translateNative('native.d1717313c1f08126')} subtitle={translateNative('native.e38281a3cb37be0c')} onClose={actions.closeCustomNavModal}>
        <ScrollView contentContainerStyle={settingsStyles.modalBody}>
          <TextField label={translateNative('common.name')} value={customNavForm.name} onChangeText={value => actions.setCustomNavForm(current => ({ ...current, name: value }))} />
          <TextField label="URL" value={customNavForm.url} onChangeText={value => actions.setCustomNavForm(current => ({ ...current, url: value }))} autoCapitalize="none" placeholder="https://example.com" />
          <TextField label={translateNative('native.4f06c4d9aa3ba07c')} value={customNavForm.icon} onChangeText={value => actions.setCustomNavForm(current => ({ ...current, icon: value }))} autoCapitalize="none" placeholder={translateNative('native.211865a156c7910b')} />
          <SwitchRow label={translateNative('native.fdb05a52ca12b23c')} value={customNavForm.open_in_new_tab} onValueChange={value => actions.setCustomNavForm(current => ({ ...current, open_in_new_tab: value }))} />
          <View style={settingsStyles.modalFooter}>
            <PrimaryButton label={translateNative('common.cancel')} variant="secondary" onPress={actions.closeCustomNavModal} />
            <PrimaryButton
              label={mutations.saveCustomNavMutation.isPending ? translateNative('native.018c2002806e2312') : translateNative('native.9204ea00e121ca1d')}
              onPress={actions.handleSaveCustomNav}
              loading={mutations.saveCustomNavMutation.isPending}
              disabled={mutations.saveCustomNavMutation.isPending}
            />
          </View>
        </ScrollView>
      </SimpleModal>

      <SimpleModal visible={virtualPrinterModalVisible} title={editingVirtualPrinter ? translateNative('native.514c84a5ccbf6c63') : translateNative('native.72f5a60c986eaf7f')} subtitle={translateNative('native.2e60717f077eb9f3')} onClose={actions.closeVirtualPrinterModal}>
        <ScrollView contentContainerStyle={settingsStyles.modalBody}>
          <TextField label={translateNative('common.name')} value={virtualPrinterForm.name} onChangeText={value => actions.setVirtualPrinterForm(current => ({ ...current, name: value }))} />
          <OptionChipsField label={translateNative('native.8b62363d3367fc41')} value={virtualPrinterForm.model_name} options={controller.derived.virtualPrinterModels} onChange={value => actions.setVirtualPrinterForm(current => ({ ...current, model_name: value }))} />
          <TextField label={translateNative('native.5c8fc78423beb60a')} value={virtualPrinterForm.model_name} onChangeText={value => actions.setVirtualPrinterForm(current => ({ ...current, model_name: value }))} />
          <TextField label={translateNative('native.0c37b531bfd6d5df')} value={virtualPrinterForm.serial_number} onChangeText={value => actions.setVirtualPrinterForm(current => ({ ...current, serial_number: value }))} autoCapitalize="characters" />
          <SwitchRow label={translateNative('common.enabled')} value={virtualPrinterForm.enabled} onValueChange={value => actions.setVirtualPrinterForm(current => ({ ...current, enabled: value }))} />
          <View style={settingsStyles.modalFooter}>
            <PrimaryButton label={translateNative('common.cancel')} variant="secondary" onPress={actions.closeVirtualPrinterModal} />
            <PrimaryButton label={editingVirtualPrinter ? (mutations.saveVirtualPrinterMutation.isPending ? translateNative('native.018c2002806e2312') : translateNative('native.4cbb21711c1fcc83')) : (mutations.saveVirtualPrinterMutation.isPending ? translateNative('native.b762dfbcd3d9c0d7') : translateNative('native.056fceb480b7ed73'))} onPress={actions.handleSaveVirtualPrinter} loading={mutations.saveVirtualPrinterMutation.isPending} disabled={mutations.saveVirtualPrinterMutation.isPending} />
          </View>
        </ScrollView>
      </SimpleModal>

      <AlertModal visible={Boolean(createdCameraToken)} variant="success" title={translateNative('native.80455701e1fdfecc')} message={createdCameraToken || translateNative('native.a2f36a9e8909ab0d')} dismissLabel={translateNative('native.50c262723339f592', { defaultValue: 'OK' })} onClose={() => actions.setCreatedCameraToken('')} />

      <SimpleModal visible={showTOTPSetup} title={translateNative('native.6e20be355da15baa')} subtitle={translateNative('native.93bea79493501ab5')} onClose={() => { actions.setShowTOTPSetup(false); actions.queryClient.removeQueries({ queryKey: ['totp-setup'] }); actions.setTotpCode(''); }}>
        <View style={settingsStyles.modalBody}>
          {queries.totpSetupQuery.isLoading ? (
            <ActivityIndicator size="large" color={controller.colors.accent} />
          ) : queries.totpSetupQuery.data ? (
            <>
              <Image source={{ uri: `data:image/png;base64,${queries.totpSetupQuery.data.qr_code_b64}` }} style={settingsStyles.qrImage} />
              <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}><NativeTranslation id="native.c15bdc4f796c8839" values={{ value0: (queries.totpSetupQuery.data.secret) }} /></Text>
              <PrimaryButton label={translateNative('native.b8c035c74a218893')} variant="secondary" onPress={() => { Clipboard.setString(queries.totpSetupQuery.data?.secret ?? ''); actions.showToast(translateNative('native.29e3310e288ebfcc'), 'success'); }} />
              <TextField label={translateNative('native.c137dc7718a985e1')} value={totpCode} onChangeText={actions.setTotpCode} keyboardType="number-pad" />
              <PrimaryButton label={mutations.enableTOTPMutation.isPending ? translateNative('native.dc7b7a02345f8232') : translateNative('native.b6e88f2416d4ef5e')} onPress={() => void mutations.enableTOTPMutation.mutateAsync(totpCode)} disabled={totpCode.trim().length !== 6 || mutations.enableTOTPMutation.isPending} loading={mutations.enableTOTPMutation.isPending} />
            </>
          ) : (
            <Text style={[settingsStyles.helper, { color: controller.colors.error }]}>{translateNative('native.e7d1c514591bfcac')}</Text>
          )}
        </View>
      </SimpleModal>

      <SimpleModal visible={showTOTPDisable} title={translateNative('native.a19c6ed345084af7')} subtitle={translateNative('native.6ab3bfe1c0362c51')} onClose={() => { actions.setShowTOTPDisable(false); actions.setTotpDisableCode(''); }}>
        <View style={settingsStyles.modalBody}>
          <TextField label={translateNative('native.9e7c2a373d4b6965')} value={totpDisableCode} onChangeText={actions.setTotpDisableCode} autoCapitalize="characters" />
          <View style={settingsStyles.modalFooter}>
            <PrimaryButton label={translateNative('common.cancel')} variant="secondary" onPress={() => { actions.setShowTOTPDisable(false); actions.setTotpDisableCode(''); }} />
            <PrimaryButton label={mutations.disableTOTPMutation.isPending ? translateNative('native.ed02fd5e7b88e337') : translateNative('native.a19c6ed345084af7')} variant="danger" onPress={() => void mutations.disableTOTPMutation.mutateAsync(totpDisableCode)} disabled={totpDisableCode.trim().length < 6 || mutations.disableTOTPMutation.isPending} loading={mutations.disableTOTPMutation.isPending} />
          </View>
        </View>
      </SimpleModal>

      <SimpleModal visible={showTOTPRegen} title={translateNative('native.09a2cb83a0a5c570')} subtitle={translateNative('native.6271f508e859590e')} onClose={() => { actions.setShowTOTPRegen(false); actions.setTotpRegenCode(''); }}>
        <View style={settingsStyles.modalBody}>
          <TextField label={translateNative('native.9e7c2a373d4b6965')} value={totpRegenCode} onChangeText={actions.setTotpRegenCode} autoCapitalize="characters" />
          <View style={settingsStyles.modalFooter}>
            <PrimaryButton label={translateNative('common.cancel')} variant="secondary" onPress={() => { actions.setShowTOTPRegen(false); actions.setTotpRegenCode(''); }} />
            <PrimaryButton label={mutations.regenerateBackupCodesMutation.isPending ? translateNative('native.508255621a40f4ae') : translateNative('native.f340f63927c403f2')} onPress={() => void mutations.regenerateBackupCodesMutation.mutateAsync(totpRegenCode)} disabled={totpRegenCode.trim().length < 6 || mutations.regenerateBackupCodesMutation.isPending} loading={mutations.regenerateBackupCodesMutation.isPending} />
          </View>
        </View>
      </SimpleModal>

      <SimpleModal visible={showDisableEmail2FA} title={translateNative('native.29d07eb6f3774a6b')} subtitle={translateNative('native.3782ec6143a730a6')} onClose={() => { actions.setShowDisableEmail2FA(false); actions.setEmailDisablePassword(''); }}>
        <View style={settingsStyles.modalBody}>
          <TextField label={translateNative('native.08c9c68cc706272f')} value={emailDisablePassword} onChangeText={actions.setEmailDisablePassword} secureTextEntry />
          <View style={settingsStyles.modalFooter}>
            <PrimaryButton label={translateNative('common.cancel')} variant="secondary" onPress={() => { actions.setShowDisableEmail2FA(false); actions.setEmailDisablePassword(''); }} />
            <PrimaryButton label={mutations.disableEmailOTPMutation.isPending ? translateNative('native.ed02fd5e7b88e337') : translateNative('native.29d07eb6f3774a6b')} variant="danger" onPress={() => void mutations.disableEmailOTPMutation.mutateAsync(emailDisablePassword)} disabled={!emailDisablePassword.trim() || mutations.disableEmailOTPMutation.isPending} loading={mutations.disableEmailOTPMutation.isPending} />
          </View>
        </View>
      </SimpleModal>

      <ConfirmModal visible={providerDeleteTarget !== null} title={translateNative('native.37f644fc3da8b128')} message={providerDeleteTarget ? translateNative('native.3e132ab74d3e7e22', { value0: String(providerDeleteTarget.name) }) : translateNative('native.279fd651a48b893f')} confirmLabel={translateNative('common.delete')} onClose={() => actions.setProviderDeleteTarget(null)} onConfirm={() => providerDeleteTarget && void mutations.deleteOIDCProviderMutation.mutateAsync(providerDeleteTarget.id)} loading={mutations.deleteOIDCProviderMutation.isPending} />

      <ConfirmModal visible={plugDeleteTarget !== null} title={translateNative('native.5a679514aa14ee8b')} message={plugDeleteTarget ? translateNative('native.3e132ab74d3e7e22', { value0: String(plugDeleteTarget.name) }) : translateNative('native.4ee490188384b24d')} confirmLabel={translateNative('common.delete')} onClose={() => actions.setPlugDeleteTarget(null)} onConfirm={() => plugDeleteTarget && void mutations.deleteSmartPlugMutation.mutateAsync(plugDeleteTarget.id)} loading={mutations.deleteSmartPlugMutation.isPending} />

      <ConfirmModal visible={pendingDeleteExternalLink !== null} title={translateNative('native.e8d25a99e8c89fdd')} message={pendingDeleteExternalLink ? translateNative('native.3e132ab74d3e7e22', { value0: String(pickString(pendingDeleteExternalLink, ['name'], translateNative('native.6142000d55f63b27'))) }) : translateNative('native.d937ef2ba177b2af')} confirmLabel={translateNative('common.delete')} onClose={() => actions.setPendingDeleteExternalLink(null)} onConfirm={() => pendingDeleteExternalLink && void mutations.deleteExternalLinkMutation.mutateAsync(pickNumber(pendingDeleteExternalLink, ['id']))} loading={mutations.deleteExternalLinkMutation.isPending} />

      <ConfirmModal visible={pendingDeleteVirtualPrinter !== null} title={translateNative('native.a144096ce76900d7')} message={pendingDeleteVirtualPrinter ? translateNative('native.3e132ab74d3e7e22', { value0: String(pickString(pendingDeleteVirtualPrinter, ['name'], translateNative('native.4d5594ecba0b0b5e'))) }) : translateNative('native.8742adfec1b30469')} confirmLabel={translateNative('common.delete')} onClose={() => actions.setPendingDeleteVirtualPrinter(null)} onConfirm={() => pendingDeleteVirtualPrinter && void mutations.deleteVirtualPrinterMutation.mutateAsync(pickNumber(pendingDeleteVirtualPrinter, ['id']))} loading={mutations.deleteVirtualPrinterMutation.isPending} />

      <SimpleModal visible={externalCameraModalVisible} title={editingExternalCamera ? translateNative('native.1b3463163b9e3fad') : translateNative('native.959063ba27aa536b')} subtitle={translateNative('native.7a69490538c9bd00')} onClose={actions.closeExternalCameraModal}>
        <ScrollView contentContainerStyle={settingsStyles.modalBody}>
          <TextField label={translateNative('common.name')} value={externalCameraForm.name} onChangeText={value => actions.setExternalCameraForm(current => ({ ...current, name: value }))} />
          <TextField label={translateNative('native.2b7f904474188d81')} value={externalCameraForm.stream_url} onChangeText={value => actions.setExternalCameraForm(current => ({ ...current, stream_url: value }))} autoCapitalize="none" placeholder="rtsp:// or http:// or https:// URL" />
          <OptionChipsField label={translateNative('native.d13b1c4b6b43bbbd')} value={externalCameraForm.camera_type} options={EXTERNAL_CAMERA_TYPE_OPTIONS} onChange={value => actions.setExternalCameraForm(current => ({ ...current, camera_type: value }))} />
          <OptionChipsField label={translateNative('screen.printer')} value={externalCameraForm.printer_id} options={controller.derived.printerOptions} onChange={value => actions.setExternalCameraForm(current => ({ ...current, printer_id: value }))} />
          <View style={settingsStyles.modalFooter}>
            <PrimaryButton label={translateNative('common.cancel')} variant="secondary" onPress={actions.closeExternalCameraModal} />
            <PrimaryButton label={mutations.createExternalCameraMutation.isPending || mutations.updateExternalCameraMutation.isPending ? translateNative('native.018c2002806e2312') : translateNative('native.d76a73fb54de8615')} onPress={actions.handleSaveExternalCamera} loading={mutations.createExternalCameraMutation.isPending || mutations.updateExternalCameraMutation.isPending} disabled={mutations.createExternalCameraMutation.isPending || mutations.updateExternalCameraMutation.isPending} />
          </View>
        </ScrollView>
      </SimpleModal>

      <ConfirmModal visible={pendingDeleteExternalCamera !== null} title={translateNative('native.fdadd587d1784b34')} message={pendingDeleteExternalCamera ? translateNative('native.3e132ab74d3e7e22', { value0: String(pickString(pendingDeleteExternalCamera, ['name'], translateNative('native.81f8dd7fd8099f22'))) }) : translateNative('native.1859c00852903826')} confirmLabel={translateNative('common.delete')} onClose={() => actions.setPendingDeleteExternalCamera(null)} onConfirm={() => pendingDeleteExternalCamera && void mutations.deleteExternalCameraMutation.mutateAsync(pickNumber(pendingDeleteExternalCamera, ['id']))} loading={mutations.deleteExternalCameraMutation.isPending} />

      <SimpleModal visible={locationModalVisible} title={editingLocation ? translateNative('native.a06f2c9b14e6e73c') : translateNative('native.2846432316620fd1')} subtitle={translateNative('native.e5a2d8907e2a902f')} onClose={actions.closeLocationModal}>
        <ScrollView contentContainerStyle={settingsStyles.modalBody}>
          <TextField label={translateNative('common.name')} value={locationForm.name} onChangeText={value => actions.setLocationForm(current => ({ ...current, name: value }))} placeholder={translateNative('native.425fe6638a069ac5')} />
          <TextField label={translateNative('native.2c9ce243b8a0f476')} value={locationForm.identifier} onChangeText={value => actions.setLocationForm(current => ({ ...current, identifier: value }))} placeholder={translateNative('native.7b4298b76c274a63')} />
          <TextField label={translateNative('native.a5dba1b4a932b0ea')} value={locationForm.address} onChangeText={value => actions.setLocationForm(current => ({ ...current, address: value }))} placeholder={translateNative('native.43332df0fcf37e64')} />
          <TextField label={translateNative('native.be6245aeb9573da2')} value={locationForm.notes} onChangeText={value => actions.setLocationForm(current => ({ ...current, notes: value }))} multiline placeholder={translateNative('native.dbfc9eedd5cac85d')} />
          <View style={settingsStyles.modalFooter}>
            <PrimaryButton label={translateNative('common.cancel')} variant="secondary" onPress={actions.closeLocationModal} />
            <PrimaryButton
              label={editingLocation ? (mutations.updateLocationMutation.isPending ? translateNative('native.018c2002806e2312') : translateNative('native.54198eb01e614fd1')) : (mutations.createLocationMutation.isPending ? translateNative('native.b762dfbcd3d9c0d7') : translateNative('native.75e3747a4394d714'))}
              onPress={actions.handleSaveLocation}
              loading={mutations.createLocationMutation.isPending || mutations.updateLocationMutation.isPending}
              disabled={mutations.createLocationMutation.isPending || mutations.updateLocationMutation.isPending}
            />
          </View>
        </ScrollView>
      </SimpleModal>

      <ConfirmModal visible={pendingDeleteLocation !== null} title={translateNative('native.f0ad035d40e00257')} message={pendingDeleteLocation ? translateNative('native.ae721c4182f0e3bd', { value0: String(pendingDeleteLocation.name) }) : translateNative('native.bf3fd2017e06b8bf')} confirmLabel={translateNative('common.delete')} onClose={() => actions.setPendingDeleteLocation(null)} onConfirm={() => pendingDeleteLocation && void mutations.deleteLocationMutation.mutateAsync(pendingDeleteLocation.id)} loading={mutations.deleteLocationMutation.isPending} />
    </>
  );
}
