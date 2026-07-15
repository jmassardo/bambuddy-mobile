import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import { useTheme } from '../../theme';
import { borderRadius, fontSize, fontWeight, spacing } from '../../theme/tokens';
import { Icon } from './TabBarIcon';

export function SearchBar({
  value,
  onChangeText,
  placeholder,
  onFilterPress,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  onFilterPress?: () => void;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.searchRow}>
      <View style={[styles.searchContainer, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
        <Icon name="search" size={18} color={colors.textTertiary} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.inputPlaceholder}
          style={[styles.searchInput, { color: colors.inputText }]}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      {onFilterPress ? (
        <Pressable
          onPress={onFilterPress}
          style={[styles.filterButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
        >
          <Icon name="filter" size={18} color={colors.text} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function SectionCard({
  title,
  subtitle,
  right,
  children,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      {(title || subtitle || right) && (
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderText}>
            {title ? <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text> : null}
            {subtitle ? <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

export function StatusBadge({ label, color }: { label: string; color: string }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.badge, { backgroundColor: `${color}22`, borderColor: `${color}55` }]}>
      <Text style={[styles.badgeText, { color: label ? color : colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

export function InlineTabBar<T extends string>({
  value,
  tabs,
  onChange,
}: {
  value: T;
  tabs: Array<{ key: T; label: string }>;
  onChange: (value: T) => void;
}) {
  const { colors } = useTheme();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.inlineTabsContainer}>
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={[
              styles.inlineTab,
              {
                backgroundColor: active ? colors.accentBg : colors.surfaceElevated,
                borderColor: active ? colors.accent : colors.border,
              },
            ]}
          >
            <Text style={[styles.inlineTabText, { color: active ? colors.accentLight : colors.textSecondary }]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.accentBg : colors.surfaceElevated,
          borderColor: selected ? colors.accent : colors.border,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: selected ? colors.accentLight : colors.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

export function SettingRow({
  icon,
  label,
  description,
  value,
  onPress,
  right,
}: {
  icon: string;
  label: string;
  description?: string;
  value?: string;
  onPress?: () => void;
  right?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const content = (
    <View style={styles.settingRow}>
      <View style={[styles.settingIcon, { backgroundColor: colors.accentBg }]}>
        <Icon name={icon} size={18} color={colors.accentLight} />
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingLabel, { color: colors.text }]}>{label}</Text>
        {description ? <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>{description}</Text> : null}
      </View>
      {right ?? (
        <View style={styles.settingRight}>
          {value ? <Text style={[styles.settingValue, { color: colors.textSecondary }]}>{value}</Text> : null}
          {onPress ? <Icon name="chevron-right" size={20} color={colors.textTertiary} /> : null}
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable style={[styles.rowPressable, { borderBottomColor: colors.borderSubtle }]} onPress={onPress}>
        {content}
      </Pressable>
    );
  }

  return <View style={[styles.rowPressable, { borderBottomColor: colors.borderSubtle }]}>{content}</View>;
}

export function StatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  const { colors } = useTheme();

  return (
    <View style={[styles.statCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      {helper ? <Text style={[styles.statHelper, { color: colors.textTertiary }]}>{helper}</Text> : null}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const palette = {
    primary: { background: colors.accent, border: colors.accent, text: colors.textInverse },
    secondary: { background: colors.surfaceElevated, border: colors.border, text: colors.text },
    danger: { background: colors.error, border: colors.error, text: colors.text },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.button,
        {
          backgroundColor: disabled ? colors.surfaceHover : palette.background,
          borderColor: disabled ? colors.border : palette.border,
          opacity: loading ? 0.8 : 1,
        },
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={palette.text} /> : <Text style={[styles.buttonText, { color: palette.text }]}>{label}</Text>}
    </Pressable>
  );
}

export function TextField({
  label,
  error,
  multiline,
  style,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  const { colors } = useTheme();

  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor={colors.inputPlaceholder}
        style={[
          styles.fieldInput,
          {
            backgroundColor: colors.inputBg,
            borderColor: error ? colors.error : colors.inputBorder,
            color: colors.inputText,
            minHeight: multiline ? 108 : undefined,
            textAlignVertical: multiline ? 'top' : 'center',
          },
          style,
        ]}
      />
      {error ? <Text style={[styles.fieldError, { color: colors.error }]}>{error}</Text> : null}
    </View>
  );
}

export function FloatingActionButton({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable onPress={onPress} style={[styles.fab, { backgroundColor: colors.accent }]}> 
      <Icon name={icon} size={18} color={colors.textInverse} />
      <Text style={[styles.fabText, { color: colors.textInverse }]}>{label}</Text>
    </Pressable>
  );
}

export function KeyValueRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();

  return (
    <View style={styles.keyValueRow}>
      <Text style={[styles.keyValueLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.keyValueValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    paddingVertical: 0,
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  cardHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  cardTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  cardSubtitle: {
    fontSize: fontSize.sm,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  inlineTabsContainer: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  inlineTab: {
    borderRadius: borderRadius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  inlineTabText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  chip: {
    borderRadius: borderRadius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
  },
  chipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  rowPressable: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingContent: {
    flex: 1,
    gap: 2,
  },
  settingLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  settingDescription: {
    fontSize: fontSize.sm,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  settingValue: {
    fontSize: fontSize.sm,
  },
  statCard: {
    flex: 1,
    minWidth: 140,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  statLabel: {
    fontSize: fontSize.sm,
  },
  statValue: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
  },
  statHelper: {
    fontSize: fontSize.xs,
  },
  button: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  fieldInput: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
  },
  fieldError: {
    fontSize: fontSize.xs,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  fabText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  keyValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  keyValueLabel: {
    fontSize: fontSize.sm,
  },
  keyValueValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
});
