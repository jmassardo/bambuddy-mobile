import React from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { RootNavigationProp } from '@/navigation/types';
import { ErrorState, LoadingScreen } from '@/components/common/StateScreens';
import { SettingsModals } from '@/components/settings/SettingsModals';
import { SettingsSectionContent } from '@/components/settings/SettingsSectionContent';
import { SettingsSectionsList } from '@/components/settings/SettingsSectionsList';
import { settingsStyles } from '@/components/settings/shared';
import { useSettingsScreenController } from '@/components/settings/useSettingsScreenController';

export default function SettingsScreen() {
  const navigation = useNavigation<RootNavigationProp<'Settings'>>();
  const controller = useSettingsScreenController();

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: 'Settings' });
  }, [navigation]);

  if (controller.queries.settingsQuery.isLoading) {
    return <LoadingScreen message="Loading settings…" />;
  }

  if (controller.queries.settingsQuery.isError) {
    return <ErrorState message="Unable to load settings." onRetry={() => void controller.actions.refreshAll()} />;
  }

  return (
    <>
      <ScrollView
        style={[settingsStyles.container, { backgroundColor: controller.colors.background }]}
        contentContainerStyle={settingsStyles.content}
        refreshControl={
          <RefreshControl
            refreshing={
              controller.queries.settingsQuery.isRefetching ||
              controller.queries.smartPlugsQuery.isRefetching ||
              controller.queries.apiKeysQuery.isRefetching ||
              controller.queries.cameraTokensQuery.isRefetching ||
              controller.queries.externalLinksQuery.isRefetching ||
              controller.queries.virtualPrinterListQuery.isRefetching
            }
            onRefresh={() => void controller.actions.refreshAll()}
            tintColor={controller.colors.accent}
          />
        }
      >
        <View style={settingsStyles.header}>
          <Text style={[settingsStyles.title, { color: controller.colors.text }]}>Settings</Text>
          <Text style={[settingsStyles.subtitle, { color: controller.colors.textSecondary }]}>Mobile settings panels with the same core controls exposed on the web.</Text>
        </View>

        {controller.state.section === null ? <SettingsSectionsList controller={controller} /> : <SettingsSectionContent controller={controller} />}
      </ScrollView>

      <SettingsModals controller={controller} />
    </>
  );
}
