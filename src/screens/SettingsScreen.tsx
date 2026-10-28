import { translateNative, useNativeLocale } from '@/i18n';
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
import { SettingsSearchFocusProvider, SettingsSearchSelection, useSettingsSearchTarget } from '@/components/settings/SettingsSearchFocus';

export default function SettingsScreen() {
  useNativeLocale();
  const navigation = useNavigation<RootNavigationProp<'Settings'>>();
  const controller = useSettingsScreenController();
  const scroll = React.useRef<ScrollView>(null);
  const content = React.useRef<View>(null);
  const searchTarget = useSettingsSearchTarget();
  React.useEffect(() => {
    if (searchTarget) {
      controller.actions.setSection(searchTarget.section);
      if (searchTarget.panel) controller.actions.setUserPanel(searchTarget.panel);
    }
    // The selected target is an explicit navigation action, not draft state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTarget]);

  React.useLayoutEffect(() => {
    navigation.setOptions({ get title() { return translateNative('nav.settings'); } });
  }, [navigation]);

  if (controller.queries.settingsQuery.isLoading) {
    return <LoadingScreen message={translateNative('native.ae25c9ca72964893')} />;
  }

  if (controller.queries.settingsQuery.isError) {
    return <ErrorState message={translateNative('native.63d6c20426789bfb')} onRetry={() => void controller.actions.refreshAll()} />;
  }

  return (
    <SettingsSearchFocusProvider content={content} scroll={scroll}>
      <ScrollView
        ref={scroll}
        style={[settingsStyles.container, { backgroundColor: controller.colors.background }]}
        refreshControl={
          <RefreshControl
            refreshing={
              controller.queries.settingsQuery.isRefetching ||
              controller.queries.smartPlugsQuery.isRefetching ||
              controller.queries.apiKeysQuery.isRefetching ||
              controller.queries.cameraTokensQuery.isRefetching ||
              controller.queries.externalLinksQuery.isRefetching ||
              controller.queries.virtualPrinterListQuery.isRefetching ||
              controller.queries.mqttStatusQuery.isRefetching
            }
            onRefresh={() => void controller.actions.refreshAll()}
            tintColor={controller.colors.accent}
          />
        }
      >
        <View ref={content} collapsable={false} style={settingsStyles.content}>
        <View style={settingsStyles.header}>
          <Text style={[settingsStyles.title, { color: controller.colors.text }]}>{translateNative('nav.settings')}</Text>
          <Text style={[settingsStyles.subtitle, { color: controller.colors.textSecondary }]}>{translateNative('native.112376eccbe7a16b')}</Text>
        </View>

        {controller.state.section !== null ? <SettingsSearchSelection /> : null}
        {controller.state.section === null ? <SettingsSectionsList controller={controller} /> : <SettingsSectionContent controller={controller} />}
        </View>
      </ScrollView>

      <SettingsModals controller={controller} />
    </SettingsSearchFocusProvider>
  );
}
