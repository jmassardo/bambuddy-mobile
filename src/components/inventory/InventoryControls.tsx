import { translateNative, useNativeLocale } from '@/i18n';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  PrimaryButton as AppButton,
  SectionCard,
  SearchBar,
  TextField,
} from '@/components/common/AppUI';
import { ConfirmModal } from '@/components/common/ConfirmModal';

import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import { useToast } from '@/contexts/ToastContext';

export function useInventoryToast() {
  return useToast();
}
export function InventoryField(props: React.ComponentProps<typeof TextField>) {
  useNativeLocale();
  return (
    <TextField
      {...props}
    />
  );
}
export function InventorySearch(props: React.ComponentProps<typeof SearchBar>) {
  useNativeLocale();
  return (
    <SearchBar
      {...props}
    />
  );
}
export function InventorySection(
  props: React.ComponentProps<typeof SectionCard>,
) {
  useNativeLocale();
  return (
    <SectionCard
      {...props}
    />
  );
}
export function InventoryConfirm(
  props: React.ComponentProps<typeof ConfirmModal>,
) {
  useNativeLocale();
  return (
    <ConfirmModal
      {...props}
    />
  );
}

export function InventoryModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useNativeLocale();
  const { colors } = useTheme();
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider style={styles.viewport}>
      <KeyboardAvoidingView style={styles.viewport} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={[styles.viewport, { backgroundColor: colors.background }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.modal,
          { backgroundColor: colors.background },
        ]}
      >
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: colors.text }]}
        >
          {title}
        </Text>
        <PrimaryButton label={translateNative('common.close')} variant="secondary" onPress={onClose} />
        {children}
      </ScrollView>
      </SafeAreaView>
      </KeyboardAvoidingView>
      </SafeAreaProvider>
    </Modal>
  );
}
export function InventoryText({ children }: { children: React.ReactNode }) {
  useNativeLocale();
  const { colors } = useTheme();
  return <Text style={{ color: colors.text }}>{children}</Text>;
}
export function InventoryButton(props: React.ComponentProps<typeof AppButton>) {
  useNativeLocale();
  return <AppButton {...props} />;
}
const PrimaryButton = InventoryButton;
export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  useNativeLocale();
  return (
    <View style={styles.row}>
      <InventoryText>{label}</InventoryText>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
      />
    </View>
  );
}
export interface Choice {
  value: string;
  label: string;
}
export function ChoiceField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Choice[];
  onChange: (value: string) => void;
}) {
  useNativeLocale();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  return (
    <>
      <PrimaryButton
        variant="secondary"
        label={`${label}: ${
          options.find(option => option.value === value)?.label ??
          (value || translateNative('common.none'))
        }`}
        onPress={() => setOpen(true)}
      />
      {open && (
        <InventoryModal title={label} onClose={() => setOpen(false)}>
          <InventorySearch
            value={search}
            onChangeText={setSearch}
            placeholder={translateNative('native.8c968bed36fd34de')}
          />
          {options
            .filter(option =>
              option.label.toLowerCase().includes(search.toLowerCase()),
            )
            .map(option => (
              <PrimaryButton
                key={option.value}
                variant={value === option.value ? 'primary' : 'secondary'}
                label={option.label}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                  setSearch('');
                }}
              />
            ))}
        </InventoryModal>
      )}
    </>
  );
}
export function Fields({
  fields,
  values,
  onChange,
}: {
  fields: ReadonlyArray<readonly [string, string]>;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  useNativeLocale();
  return (
    <>
      {fields.map(([key, label]) => (
        <TextField
          key={key}
          label={label}
          value={values[key] ?? ''}
          onChangeText={value => onChange(key, value)}
          autoCapitalize="none"
        />
      ))}
    </>
  );
}
export const inventoryControlStyles = StyleSheet.create({
  group: { gap: spacing.sm, paddingVertical: spacing.sm },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
});
const styles = StyleSheet.create({
  viewport: { flex: 1 },
  modal: {
    padding: spacing.lg,
    paddingTop: spacing['5xl'],
    gap: spacing.md,
    flexGrow: 1,
  },
  title: { fontSize: 24, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
});
