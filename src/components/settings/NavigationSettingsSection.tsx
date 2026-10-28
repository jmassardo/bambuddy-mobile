import { NativeTranslation, translateNative, useLocalizedMemo, useNativeLocale } from '@/i18n';
import React from 'react';
import { Text, View } from 'react-native';
import { PrimaryButton, SectionCard, StatusBadge } from '@/components/common/AppUI';
import { BUILT_IN_NAV_ITEMS, type BuiltInNavId } from '@/navigation/navigationConfig';
import { settingsStyles, SwitchRow } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';

export function NavigationSettingsSection({
  controller,
}: {
  controller: SettingsScreenController;
}) {
  useNativeLocale();
  const visibleIds = controller.state.navigationOrderDraft;
  const { setNavigationOrderDraft } = controller.actions;
  const visibleIdSet = useLocalizedMemo(() => new Set(visibleIds), [visibleIds]);
  const allItems = useLocalizedMemo(
    () => [
      ...visibleIds
        .map(id => BUILT_IN_NAV_ITEMS.find(item => item.id === id))
        .filter((item): item is (typeof BUILT_IN_NAV_ITEMS)[number] => Boolean(item)),
      ...BUILT_IN_NAV_ITEMS.filter(item => !visibleIdSet.has(item.id)),
    ],
    [visibleIdSet, visibleIds],
  );

  const toggleVisible = React.useCallback(
    (id: BuiltInNavId, visible: boolean) => {
      const item = BUILT_IN_NAV_ITEMS.find(candidate => candidate.id === id);
      if (item?.lockVisibility && !visible) {
        return;
      }

      setNavigationOrderDraft(current =>
        visible
          ? current.includes(id)
            ? current
            : [...current, id]
          : current.filter(currentId => currentId !== id),
      );
    },
    [setNavigationOrderDraft],
  );

  const moveVisibleItem = React.useCallback(
    (id: BuiltInNavId, direction: -1 | 1) => {
      setNavigationOrderDraft(current => {
        const currentIndex = current.indexOf(id);
        const targetIndex = currentIndex + direction;
        if (
          currentIndex < 0 ||
          targetIndex < 0 ||
          targetIndex >= current.length
        ) {
          return current;
        }

        const nextIds = [...current];
        const [moved] = nextIds.splice(currentIndex, 1);
        nextIds.splice(targetIndex, 0, moved);
        return nextIds;
      });
    },
    [setNavigationOrderDraft],
  );

  return (
    <SectionCard
      title={translateNative('native.aa4ef5cabaebeed1')}
      subtitle={translateNative('native.f3687aae1b1f7828')}
    >
      <Text
        style={[
          settingsStyles.helper,
          { color: controller.colors.textSecondary },
        ]}
      ><NativeTranslation id="native.4fbc51d5c67a2aa0" values={{ value0: (visibleIds.length), value1: (BUILT_IN_NAV_ITEMS.length - visibleIds.length) }} /></Text>
      {allItems.map(item => {
        const isVisible = visibleIdSet.has(item.id);
        const visibleIndex = visibleIds.indexOf(item.id);
        const canMoveUp = isVisible && visibleIndex > 0;
        const canMoveDown =
          isVisible && visibleIndex < visibleIds.length - 1;

        return (
          <View
            key={item.id}
            style={[
              settingsStyles.itemCard,
              {
                backgroundColor: controller.colors.surfaceElevated,
                borderColor: controller.colors.border,
              },
            ]}
          >
            <View style={settingsStyles.itemHeader}>
              <View style={settingsStyles.itemText}>
                <Text
                  style={[
                    settingsStyles.itemTitle,
                    { color: controller.colors.text },
                  ]}
                >
                  {item.label}
                </Text>
                <Text
                  style={[
                    settingsStyles.itemMeta,
                    { color: controller.colors.textSecondary },
                  ]}
                >
                  {item.subtitle}
                </Text>
              </View>
              <StatusBadge
                label={isVisible ? `#${visibleIndex + 1}` : translateNative('native.4b232b6adc6f30a2')}
                color={
                  isVisible
                    ? controller.colors.accent
                    : controller.colors.textSecondary
                }
              />
            </View>

            <SwitchRow
              label={translateNative('native.1dc04f857ddcbefd')}
              value={isVisible}
              onValueChange={value => toggleVisible(item.id, value)}
              description={
                item.lockVisibility ? translateNative('native.79fb9bae0e6c2d2c') : undefined
              }
              disabled={item.lockVisibility}
            />

            <View style={settingsStyles.actions}>
              <PrimaryButton
                label={translateNative('native.8ba1af69ff166671')}
                variant="secondary"
                onPress={() => moveVisibleItem(item.id, -1)}
                disabled={!canMoveUp}
              />
              <PrimaryButton
                label={translateNative('native.88156bfc217b6318')}
                variant="secondary"
                onPress={() => moveVisibleItem(item.id, 1)}
                disabled={!canMoveDown}
              />
            </View>
          </View>
        );
      })}
      <PrimaryButton
        label={
          controller.mutations.saveNavigationOrderMutation.isPending
            ? translateNative('native.018c2002806e2312')
            : translateNative('native.8235d49dba692b98')
        }
        onPress={() =>
          void controller.mutations.saveNavigationOrderMutation.mutateAsync()
        }
        loading={
          controller.mutations.saveNavigationOrderMutation.isPending
        }
        disabled={
          !controller.permissions.canUpdateSettings ||
          controller.mutations.saveNavigationOrderMutation.isPending
        }
      />
    </SectionCard>
  );
}
