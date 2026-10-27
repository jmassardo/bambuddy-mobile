import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { PrimaryButton, TextField } from '@/components/common/AppUI';
import { useTheme } from '@/theme';
import { spacing, borderRadius } from '@/theme/tokens';
import { useTranslation } from '@/i18n';

export function Copy({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <Text style={{ color: colors.text }}>{children}</Text>;
}
export function Box({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={[styles.box, { borderColor: colors.border }]}>{children}</View>;
}
export function Choice({ label, value, options, onChange, disabled = false }: {
  label: string; value: string; options: { value: string; label: string }[];
  onChange: (value: string) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { colors } = useTheme();
  const { t } = useTranslation();
  return <View style={styles.gap}>
    <PrimaryButton label={`${label}: ${options.find(o => o.value === value)?.label ?? value}`} variant="secondary" disabled={disabled} onPress={() => setOpen(true)} />
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: colors.surface }]}>
        <TextField label={label} value={search} onChangeText={setSearch} />
        <ScrollView keyboardShouldPersistTaps="handled">
          {options.filter(o => o.label.toLowerCase().includes(search.toLowerCase())).map(o =>
            <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ selected: o.value === value }} accessibilityLabel={o.label}
              style={[styles.option, { borderColor: colors.border }]} onPress={() => { onChange(o.value); setOpen(false); setSearch(''); }}>
              <Copy>{o.label}{o.value === value ? ' ✓' : ''}</Copy>
            </Pressable>)}
        </ScrollView>
        <PrimaryButton label={t('common.close', { defaultValue: 'Close' })} variant="secondary" onPress={() => setOpen(false)} />
      </View></View>
    </Modal>
  </View>;
}
export function Toggle({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <View style={styles.row}><View style={styles.flex}><Copy>{label}</Copy></View><Switch accessibilityLabel={label} value={value} onValueChange={onChange} disabled={disabled} /></View>;
}
export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: colors.surface }]}>
      <Copy>{title}</Copy><PrimaryButton label={t('common.close', { defaultValue: 'Close' })} variant="secondary" onPress={onClose} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.gap}>{children}</ScrollView>
    </View></View>
  </Modal>;
}
export const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  box: { padding: spacing.md, borderWidth: 1, borderRadius: borderRadius.lg, gap: spacing.sm },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0009', padding: spacing.md },
  sheet: { maxHeight: '94%', borderRadius: borderRadius.lg, padding: spacing.md, gap: spacing.sm },
  option: { padding: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
});
