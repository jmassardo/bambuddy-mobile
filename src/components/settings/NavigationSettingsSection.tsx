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
  const visibleIds = controller.state.navigationOrderDraft;
  const { setNavigationOrderDraft } = controller.actions;
  const visibleIdSet = React.useMemo(() => new Set(visibleIds), [visibleIds]);
  const allItems = React.useMemo(
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
      title="Navigation layout"
      subtitle="Control which pages appear and the order used across tabs and the More menu."
    >
      <Text
        style={[
          settingsStyles.helper,
          { color: controller.colors.textSecondary },
        ]}
      >
        Visible: {visibleIds.length} • Hidden:{' '}
        {BUILT_IN_NAV_ITEMS.length - visibleIds.length}
      </Text>
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
                label={isVisible ? `#${visibleIndex + 1}` : 'hidden'}
                color={
                  isVisible
                    ? controller.colors.accent
                    : controller.colors.textSecondary
                }
              />
            </View>

            <SwitchRow
              label="Visible"
              value={isVisible}
              onValueChange={value => toggleVisible(item.id, value)}
              description={
                item.lockVisibility ? 'This item is always shown.' : undefined
              }
              disabled={item.lockVisibility}
            />

            <View style={settingsStyles.actions}>
              <PrimaryButton
                label="Move up"
                variant="secondary"
                onPress={() => moveVisibleItem(item.id, -1)}
                disabled={!canMoveUp}
              />
              <PrimaryButton
                label="Move down"
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
            ? 'Saving…'
            : 'Save navigation'
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
