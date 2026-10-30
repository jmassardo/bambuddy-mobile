import { translateNative, useNativeLocale } from '@/i18n';
import React from 'react';
import { Alert, Text, View } from 'react-native';
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
  useNativeLocale();
  const { loadItems, syncItems } = useCustomNavStore();

  React.useEffect(() => {
    loadItems();
  }, [loadItems]);

  React.useEffect(() => {
    syncItems();
  }, [syncItems]);

  const customItems = useCustomNavStore(state => state.items);
  const removeItem = useCustomNavStore(state => state.removeItem);
  const moveItem = useCustomNavStore(state => state.moveItem);

  const handleAdd = () => {
    controller.actions.openCustomNavModal();
  };

  const handleDelete = (id: string) => {
    Alert.alert(translateNative('common.delete'), customItems.find(item => item.id === id)?.name, [
      { text: translateNative('common.cancel'), style: 'cancel' },
      { text: translateNative('common.delete'), style: 'destructive', onPress: () => removeItem(id) },
    ]);
  };

  return (
    <SectionCard
      title={translateNative('native.6cc15554692308aa')}
      subtitle={translateNative('native.9a26ec5d0389c65e')}
    >
      <PrimaryButton
        label={translateNative('native.d1717313c1f08126')}
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
                  {item.name || translateNative('native.d047d453e13c7eec')}
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
                label={item.open_in_new_tab ? translateNative('native.6efe26285df4359c') : translateNative('native.3c3335ed4c1dfd0f')}
                color={controller.colors.accent}
              />
            </View>
            <View style={settingsStyles.actions}>
              <PrimaryButton
                label={translateNative('native.8ba1af69ff166671')}
                variant="secondary"
                onPress={() => moveItem(item.id, -1)}
                disabled={index === 0}
              />
              <PrimaryButton
                label={translateNative('native.88156bfc217b6318')}
                variant="secondary"
                onPress={() => moveItem(item.id, 1)}
                disabled={index === customItems.length - 1}
              />
              <PrimaryButton
                label={translateNative('common.edit')}
                variant="secondary"
                onPress={() => {
                  controller.actions.openCustomNavModal(item as ApiRecord);
                }}
              />
              <PrimaryButton
                label={translateNative('common.delete')}
                variant="danger"
                onPress={() => handleDelete(item.id)}
              />
            </View>
          </View>
        ))
      ) : (
        <EmptyState
          icon="🔗"
          title={translateNative('native.66902ccad23d0979')}
          message={translateNative('native.22199de83879840b')}
        />
      )}
    </SectionCard>
  );
}
