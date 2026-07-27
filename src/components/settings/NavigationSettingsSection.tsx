import React from 'react';
import { Text, View } from 'react-native';
import { PrimaryButton, SectionCard, StatusBadge } from '@/components/common/AppUI';
import { BUILT_IN_NAV_ITEMS, getNavigationLayout, serializeNavigationOrder, type BuiltInNavId } from '@/navigation/navigationConfig';
import { pickString } from '@/utils/data';
import { settingsStyles, SwitchRow } from './shared';
import type { SettingsScreenController } from './useSettingsScreenController';

function toSavedOrder(ids: BuiltInNavId[]): string {
  const defaultOrder = BUILT_IN_NAV_ITEMS.map(item => item.id);
  const matchesDefault = ids.length === defaultOrder.length && ids.every((id, index) => id === defaultOrder[index]);
  return matchesDefault ? '' : serializeNavigationOrder(ids);
}

export function NavigationSettingsSection({ controller }: { controller: SettingsScreenController }) {
  const { draft } = controller.state;
  const { setDraft } = controller.actions;
  const orderValue = pickString(draft, ['default_sidebar_order']);

  const layout = React.useMemo(
    () => getNavigationLayout({ defaultSidebarOrder: orderValue }),
    [orderValue],
  );

  const visibleIds = React.useMemo(
    () => layout.orderedBuiltIns.map(item => item.id),
    [layout.orderedBuiltIns],
  );

  const allItems = React.useMemo(
    () => [...layout.orderedBuiltIns, ...layout.hiddenBuiltIns],
    [layout.hiddenBuiltIns, layout.orderedBuiltIns],
  );

  const persistVisibleIds = React.useCallback(
    (ids: BuiltInNavId[]) => {
      setDraft(current => ({
        ...current,
        default_sidebar_order: toSavedOrder(ids),
      }));
    },
    [setDraft],
  );

  const toggleVisible = React.useCallback(
    (id: BuiltInNavId, visible: boolean) => {
      const nextIds = visible
        ? visibleIds.includes(id)
          ? visibleIds
          : [...visibleIds, id]
        : visibleIds.filter(currentId => currentId !== id);
      persistVisibleIds(nextIds);
    },
    [persistVisibleIds, visibleIds],
  );

  const moveVisibleItem = React.useCallback(
    (id: BuiltInNavId, direction: -1 | 1) => {
      const currentIndex = visibleIds.indexOf(id);
      if (currentIndex < 0) {
        return;
      }
      const targetIndex = currentIndex + direction;
      if (targetIndex < 0 || targetIndex >= visibleIds.length) {
        return;
      }
      const nextIds = [...visibleIds];
      const [moved] = nextIds.splice(currentIndex, 1);
      nextIds.splice(targetIndex, 0, moved);
      persistVisibleIds(nextIds);
    },
    [persistVisibleIds, visibleIds],
  );

  return (
    <SectionCard title="Navigation layout" subtitle="Control which pages appear and the order used across tabs and the More menu.">
      <Text style={[settingsStyles.helper, { color: controller.colors.textSecondary }]}>
        Visible: {layout.orderedBuiltIns.length} • Hidden: {layout.hiddenBuiltIns.length}
      </Text>
      {allItems.map(item => {
        const isVisible = visibleIds.includes(item.id);
        const visibleIndex = visibleIds.indexOf(item.id);
        const canMoveUp = isVisible && visibleIndex > 0;
        const canMoveDown = isVisible && visibleIndex < visibleIds.length - 1;
        return (
          <View
            key={item.id}
            style={[
              settingsStyles.itemCard,
              { backgroundColor: controller.colors.surfaceElevated, borderColor: controller.colors.border },
            ]}
          >
            <View style={settingsStyles.itemHeader}>
              <View style={settingsStyles.itemText}>
                <Text style={[settingsStyles.itemTitle, { color: controller.colors.text }]}>{item.label}</Text>
                <Text style={[settingsStyles.itemMeta, { color: controller.colors.textSecondary }]}>{item.subtitle}</Text>
              </View>
              <StatusBadge
                label={isVisible ? `#${visibleIndex + 1}` : 'hidden'}
                color={isVisible ? controller.colors.accent : controller.colors.textSecondary}
              />
            </View>

            <SwitchRow
              label="Visible"
              value={isVisible}
              onValueChange={value => toggleVisible(item.id, value)}
              description={item.lockVisibility ? 'This item is always shown.' : undefined}
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
    </SectionCard>
  );
}
