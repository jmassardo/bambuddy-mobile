import React, { useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import {
  PrimaryButton as AppButton,
  SectionCard,
  SearchBar,
  TextField,
} from '@/components/common/AppUI';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useTranslation } from '@/i18n';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';
import { useToast } from '@/contexts/ToastContext';

export function useInventoryToast() {
  const toast = useToast();
  const { t } = useTranslation();
  return {
    ...toast,
    showToast: (...args: Parameters<typeof toast.showToast>) =>
      toast.showToast(
        t(`inventory.feedback.${args[0]}`, { defaultValue: args[0] }),
        args[1],
        args[2],
      ),
  };
}
export function InventoryField(props: React.ComponentProps<typeof TextField>) {
  const { t } = useTranslation();
  return (
    <TextField
      {...props}
      label={t(`inventory.field.${props.label}`, { defaultValue: props.label })}
    />
  );
}
export function InventorySearch(props: React.ComponentProps<typeof SearchBar>) {
  const { t } = useTranslation();
  return (
    <SearchBar
      {...props}
      placeholder={t(`inventory.search.${props.placeholder}`, {
        defaultValue: props.placeholder,
      })}
    />
  );
}
export function InventorySection(
  props: React.ComponentProps<typeof SectionCard>,
) {
  const { t } = useTranslation();
  return (
    <SectionCard
      {...props}
      title={
        props.title
          ? t(`inventory.heading.${props.title}`, { defaultValue: props.title })
          : undefined
      }
      subtitle={
        props.subtitle
          ? t(`inventory.description.${props.subtitle}`, {
              defaultValue: props.subtitle,
            })
          : undefined
      }
    />
  );
}
export function InventoryConfirm(
  props: React.ComponentProps<typeof ConfirmModal>,
) {
  const { t } = useTranslation();
  return (
    <ConfirmModal
      {...props}
      title={t(`inventory.confirm.${props.title}`, {
        defaultValue: props.title,
      })}
      message={t(`inventory.confirm.${props.message}`, {
        defaultValue: props.message,
      })}
      confirmLabel={t('common.confirm', {
        defaultValue: props.confirmLabel ?? 'Confirm',
      })}
      cancelLabel={t('common.cancel', {
        defaultValue: props.cancelLabel ?? 'Cancel',
      })}
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
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <ScrollView
        contentContainerStyle={[
          styles.modal,
          { backgroundColor: colors.background },
        ]}
      >
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: colors.text }]}
        >
          {t(`inventory.heading.${title}`, { defaultValue: title })}
        </Text>
        <PrimaryButton label="Close" variant="secondary" onPress={onClose} />
        {children}
      </ScrollView>
    </Modal>
  );
}
export function InventoryText({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const translated = React.Children.map(children, child =>
    typeof child === 'string'
      ? t(`inventory.text.${child}`, { defaultValue: child })
      : child,
  );
  return <Text style={{ color: colors.text }}>{translated}</Text>;
}
export function InventoryButton(props: React.ComponentProps<typeof AppButton>) {
  const { t } = useTranslation();
  return (
    <AppButton
      {...props}
      label={t(`inventory.action.${props.label}`, {
        defaultValue: props.label,
      })}
    />
  );
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
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <InventoryText>{label}</InventoryText>
      <Switch
        accessibilityLabel={t(`inventory.control.${label}`, {
          defaultValue: label,
        })}
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
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  return (
    <>
      <PrimaryButton
        variant="secondary"
        label={`${label}: ${
          options.find(option => option.value === value)?.label ??
          (value || 'None')
        }`}
        onPress={() => setOpen(true)}
      />
      {open && (
        <InventoryModal title={label} onClose={() => setOpen(false)}>
          <InventorySearch
            value={search}
            onChangeText={setSearch}
            placeholder="Search choices"
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
  const { t } = useTranslation();
  return (
    <>
      {fields.map(([key, label]) => (
        <TextField
          key={key}
          label={t(`inventory.field.${key}`, { defaultValue: label })}
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
