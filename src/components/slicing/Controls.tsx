import { useNativeLocale, useTranslation } from '@/i18n';
import React, { useState } from 'react';
import {
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton, TextField } from '@/components/common/AppUI';
import { useTheme } from '@/theme';
import { spacing, borderRadius } from '@/theme/tokens';

export function Copy({ children }: { children: React.ReactNode }) {
  useNativeLocale();
  const { colors } = useTheme();
  return <Text style={{ color: colors.text }}>{children}</Text>;
}
export function Box({ children }: { children: React.ReactNode }) {
  useNativeLocale();
  const { colors } = useTheme();
  return (
    <View style={[styles.box, { borderColor: colors.border }]}>{children}</View>
  );
}
export function Choice({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  useNativeLocale();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.gap}>
      <PrimaryButton
        label={`${label}: ${
          options.find(o => o.value === value)?.label ?? value
        }`}
        variant="secondary"
        disabled={disabled}
        onPress={() => setOpen(true)}
      />
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaProvider>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <SafeAreaView style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
          <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
            <TextField label={label} value={search} onChangeText={setSearch} />
            <ScrollView keyboardShouldPersistTaps="handled">
              {options
                .filter(o =>
                  o.label.toLowerCase().includes(search.toLowerCase()),
                )
                .map(o => (
                  <Pressable
                    key={o.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: o.value === value, disabled }}
                    accessibilityLabel={o.label}
                    disabled={disabled}
                    style={[styles.option, { borderColor: colors.border }]}
                    onPress={() => {
                      if (disabled) return;
                      onChange(o.value);
                      setOpen(false);
                      setSearch('');
                    }}
                  >
                    <Copy>
                      {o.label}
                      {o.value === value ? ' ✓' : ''}
                    </Copy>
                  </Pressable>
                ))}
            </ScrollView>
            <PrimaryButton
              label={t('common.close', { defaultValue: 'Close' })}
              variant="secondary"
              onPress={() => setOpen(false)}
            />
          </View>
        </SafeAreaView>
        </KeyboardAvoidingView>
        </SafeAreaProvider>
      </Modal>
    </View>
  );
}
export function Toggle({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  useNativeLocale();
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <Copy>{label}</Copy>
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
      />
    </View>
  );
}
export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useNativeLocale();
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <Copy>{title}</Copy>
          <PrimaryButton
            label={t('common.close', { defaultValue: 'Close' })}
            variant="secondary"
            onPress={onClose}
          />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.gap}
          >
            {children}
          </ScrollView>
        </View>
      </SafeAreaView>
      </KeyboardAvoidingView>
      </SafeAreaProvider>
    </Modal>
  );
}
export const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  box: {
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.md,
  },
  sheet: {
    maxHeight: '94%',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  option: { padding: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
});
