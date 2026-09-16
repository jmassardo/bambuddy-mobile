import React from 'react';
import { Text, View } from 'react-native';
import { EmptyState } from '@/components/common/StateScreens';
import { PrimaryButton, SectionCard, StatusBadge } from '@/components/common/AppUI';
import { settingsStyles } from './shared';
import { useCustomNavStore } from '@/store/navigationStore';
import type { SettingsScreenController } from './useSettingsScreenController';
import { type ApiRecord } from '@/utils/data';

export function CustomNavigationSettingsSection({
  controller,
}: {
  controller: SettingsScreenController;
}) {
  const { loadItems, syncItems } = useCustomNavStore();

  React.useEffect(() => {
    loadItems();
  }, [loadItems]);

  React.useEffect(() => {
    syncItems();
  }, [syncItems]);

  const customItems = useCustomNavStore(state => state.items);
  const addItem = useCustomNavStore(state => state.addItem);
  const removeItem = useCustomNavStore(state => state.removeItem);
  const moveItem = useCustomNavStore(state => state.moveItem);

  const handleAdd = () => {
    addItem({
      name: '',
      url: '',
      icon: 'link',
      open_in_new_tab: true,
      sort_order: 0,
    });
  };

  const handleDelete = (id: string) => {
    removeItem(id);
  };

  return (
    <SectionCard
      title="Custom navigation"
      subtitle="Add custom external links that appear alongside your navigation menu."
    >
      <PrimaryButton
        label="Add custom link"
        variant="secondary"
        onPress={handleAdd}
      />
      {customItems.length > 0 ? (
        customItems.map((item, index) => (
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
                  {item.name || 'Untitled'}
                </Text>
                <Text
                  style={[
                    settingsStyles.itemMeta,
                    { color: controller.colors.textSecondary },
                  ]}
                >
                  {item.url}
                </Text>
              </View>
              <StatusBadge
                label={item.open_in_new_tab ? 'external' : 'embedded'}
                color={controller.colors.accent}
              />
            </View>
            <View style={settingsStyles.actions}>
              <PrimaryButton
                label="Move up"
                variant="secondary"
                onPress={() => moveItem(item.id, -1)}
                disabled={index === 0}
              />
              <PrimaryButton
                label="Move down"
                variant="secondary"
                onPress={() => moveItem(item.id, 1)}
                disabled={index === customItems.length - 1}
              />
              <PrimaryButton
                label="Edit"
                variant="secondary"
                onPress={() => {
                  controller.actions.openCustomNavModal(item as ApiRecord);
                }}
              />
              <PrimaryButton
                label="Delete"
                variant="danger"
                onPress={() => handleDelete(item.id)}
              />
            </View>
          </View>
        ))
      ) : (
        <EmptyState
          icon="🔗"
          title="No custom links"
          message="Add custom navigation links that appear in your menu."
        />
      )}
    </SectionCard>
  );
}
