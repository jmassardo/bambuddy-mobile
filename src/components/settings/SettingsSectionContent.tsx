import React from 'react';
import { Text } from 'react-native';
import { PrimaryButton } from '@/components/common/AppUI';
import { ApiKeysSettingsSection } from './ApiKeysSettingsSection';
import { BackupSettingsSection } from './BackupSettingsSection';
import { FailureDetectionSettingsSection } from './FailureDetectionSettingsSection';
import { FilamentSettingsSection } from './FilamentSettingsSection';
import { GeneralSettingsSection } from './GeneralSettingsSection';
import { NetworkSettingsSection } from './NetworkSettingsSection';
import { NotificationsSettingsSection } from './NotificationsSettingsSection';
import { QueueSettingsSection } from './QueueSettingsSection';
import { SmartPlugsSection } from './SmartPlugsSection';
import { SpoolBuddySettingsSection } from './SpoolBuddySettingsSection';
import { settingsStyles } from './shared';
import { UsersSecuritySection } from './UsersSecuritySection';
import { VirtualPrinterSettingsSection } from './VirtualPrinterSettingsSection';
import type { SettingsScreenController } from './useSettingsScreenController';

export function SettingsSectionContent({ controller }: { controller: SettingsScreenController }) {
  const { section } = controller.state;

  if (section === null) {
    return null;
  }

  return (
    <>
      <PrimaryButton label="Back to sections" variant="secondary" onPress={() => controller.actions.setSection(null)} />
      {section === 'general' ? <GeneralSettingsSection controller={controller} /> : null}
      {section === 'plugs' ? <SmartPlugsSection controller={controller} /> : null}
      {section === 'notifications' ? <NotificationsSettingsSection controller={controller} /> : null}
      {section === 'queue' ? <QueueSettingsSection controller={controller} /> : null}
      {section === 'filament' ? <FilamentSettingsSection controller={controller} /> : null}
      {section === 'network' ? <NetworkSettingsSection controller={controller} /> : null}
      {section === 'apikeys' ? <ApiKeysSettingsSection controller={controller} /> : null}
      {section === 'virtual-printer' ? <VirtualPrinterSettingsSection controller={controller} /> : null}
      {section === 'spoolbuddy' ? <SpoolBuddySettingsSection controller={controller} /> : null}
      {section === 'failure-detection' ? <FailureDetectionSettingsSection controller={controller} /> : null}
      {section === 'users' ? <UsersSecuritySection controller={controller} /> : null}
      {section === 'backup' ? <BackupSettingsSection controller={controller} /> : null}
      {controller.derived.isDirtySection ? (
        <PrimaryButton
          label={controller.mutations.saveSettingsMutation.isPending ? 'Saving…' : 'Save settings'}
          onPress={() => void controller.mutations.saveSettingsMutation.mutateAsync()}
          loading={controller.mutations.saveSettingsMutation.isPending}
          disabled={!controller.permissions.canUpdateSettings || controller.mutations.saveSettingsMutation.isPending}
        />
      ) : null}
      {!controller.isAdmin ? <Text style={[settingsStyles.helper, { color: controller.colors.warning }]}>Some sections may be read-only without admin access.</Text> : null}
    </>
  );
}
