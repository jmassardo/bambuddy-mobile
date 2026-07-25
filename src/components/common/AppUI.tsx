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
  type ViewStyle,
} from 'react-native';
import {
  BarChart3,
  Bell,
  ChevronRight,
  Circle,
  Copy,
  Cpu,
  Download,
  Filter,
  Globe,
  KeyRound,
  Layers,
  ListOrdered,
  Package,
  Plus,
  Power,
  Printer,
  QrCode,
  Radio,
  Search,
  Settings,
  Shield,
  Users,
  Wrench,
} from 'lucide-react-native';
import { useTheme } from '../../theme';
import { borderRadius, fontSize, fontWeight, spacing } from '../../theme/tokens';

const APP_UI_ICONS: Record<
  string,
  React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
> = {
  settings: Settings,
  power: Power,
  bell: Bell,
  'list-ordered': ListOrdered,
  package: Package,
  globe: Globe,
  key: KeyRound,
  printer: Printer,
  nfc: Radio,
  shield: Shield,
  users: Users,
  download: Download,
  plus: Plus,
  wrench: Wrench,
  layers: Layers,
  copy: Copy,
  'bar-chart': BarChart3,
  cpu: Cpu,
  'qr-code': QrCode,
};

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
        <Search size={16} color={colors.textTertiary} strokeWidth={2} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.inputPlaceholder}
          style={[styles.searchInput, { color: colors.inputText }]}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={placeholder}
          accessibilityRole="search"
        />
      </View>
      {onFilterPress ? (
        <Pressable
          onPress={onFilterPress}
          style={[styles.filterButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
          accessibilityLabel="Filters"
          accessibilityRole="button"
        >
          <Filter size={18} color={colors.text} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  );
}

export const SectionCard = React.memo(function SectionCard({
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
});

export const StatusBadge = React.memo(function StatusBadge({ label, color }: { label: string; color: string }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.badge, { backgroundColor: `${color}22`, borderColor: `${color}55` }]} accessibilityRole="text" accessibilityLabel={label}>
      <Text style={[styles.badgeText, { color: label ? color : colors.textSecondary }]}>{label}</Text>
    </View>
  );
});

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
            accessibilityLabel={tab.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
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

export const Chip = React.memo(function Chip({
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
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.chipText, { color: selected ? colors.accentLight : colors.textSecondary }]}>{label}</Text>
    </Pressable>
  );
});

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
  const IconComponent = APP_UI_ICONS[icon] ?? Circle;
  const content = (
    <View style={styles.settingRow}>
      <View style={[styles.settingIcon, { backgroundColor: colors.accentBg }]}>
        <IconComponent size={18} color={colors.accentLight} strokeWidth={2} />
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingLabel, { color: colors.text }]}>{label}</Text>
        {description ? <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>{description}</Text> : null}
      </View>
      {right ?? (
        <View style={styles.settingRight}>
          {value ? <Text style={[styles.settingValue, { color: colors.textSecondary }]}>{value}</Text> : null}
          {onPress ? <ChevronRight size={20} color={colors.textTertiary} strokeWidth={2} /> : null}
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable style={[styles.rowPressable, { borderBottomColor: colors.borderSubtle }]} onPress={onPress} accessibilityLabel={description ? `${label}, ${description}` : label} accessibilityRole="button">
        {content}
      </Pressable>
    );
  }

  return <View style={[styles.rowPressable, { borderBottomColor: colors.borderSubtle }]}>{content}</View>;
}

export const StatCard = React.memo(function StatCard({
  label,
  value,
  helper: _helper,
  onPress,
}: {
  label: string;
  value: string;
  helper?: string;
  onPress?: () => void;
}) {
  const { colors } = useTheme();

  const content = (
    <View style={[styles.statCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );

  if (onPress) {
    return <Pressable onPress={onPress} style={{ flex: 1 }} accessibilityLabel={`${label}: ${value}`} accessibilityRole="button">{content}</Pressable>;
  }
  return content;
});

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
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
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
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]} accessibilityRole="text">{label}</Text>
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
  const IconComponent = APP_UI_ICONS[icon] ?? Circle;

  return (
    <Pressable onPress={onPress} style={[styles.fab, { backgroundColor: colors.accent }]} accessibilityLabel={label} accessibilityRole="button"> 
      <IconComponent size={18} color={colors.textInverse} strokeWidth={2} />
      <Text style={[styles.fabText, { color: colors.textInverse }]}>{label}</Text>
    </Pressable>
  );
}

export const KeyValueRow = React.memo(function KeyValueRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();

  return (
    <View style={styles.keyValueRow}>
      <Text style={[styles.keyValueLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.keyValueValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
});

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
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    paddingVertical: 2,
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
    minWidth: 70,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  statLabel: {
    fontSize: fontSize.xs,
  },
  statValue: {
    fontSize: fontSize.lg,
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

export function ProgressBar({
  progress,
  color,
  trackColor,
  height = 6,
}: {
  progress: number;
  color: string;
  trackColor?: string;
  height?: number;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ height, backgroundColor: trackColor || colors.surfaceElevated, borderRadius: height / 2, overflow: 'hidden' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress) }}>
      <View
        style={{
          width: `${Math.max(0, Math.min(100, progress))}%`,
          height: '100%',
          backgroundColor: color,
          borderRadius: height / 2,
        }}
      />
    </View>
  );
}

// --- Components consolidated from UIComponents.tsx ---

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  style?: ViewStyle;
  size?: 'sm' | 'md' | 'lg';
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  style,
  size = 'md',
}: ButtonProps) {
  const { colors } = useTheme();

  const bgColors: Record<ButtonVariant, string> = {
    primary: colors.accent,
    secondary: colors.surfaceElevated,
    danger: colors.error,
    ghost: 'transparent',
  };

  const textColors: Record<ButtonVariant, string> = {
    primary: colors.textInverse,
    secondary: colors.text,
    danger: colors.textInverse,
    ghost: colors.accent,
  };

  const paddings = {
    sm: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
    md: { paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
    lg: { paddingVertical: spacing.lg, paddingHorizontal: spacing['2xl'] },
  };

  const fontSizes = { sm: fontSize.sm, md: fontSize.base, lg: fontSize.lg };

  const IconComponent = icon ? APP_UI_ICONS[icon] ?? null : null;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        consolidatedStyles.button,
        paddings[size],
        {
          backgroundColor: bgColors[variant],
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: variant === 'secondary' ? colors.border : undefined,
        },
        style,
      ]}
      accessibilityLabel={title}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColors[variant]} />
      ) : (
        <View style={consolidatedStyles.buttonContent}>
          {IconComponent && (
            <View style={{ marginRight: spacing.sm }}>
              <IconComponent size={fontSizes[size]} color={textColors[variant]} strokeWidth={2} />
            </View>
          )}
          <Text style={[consolidatedStyles.buttonText, { color: textColors[variant], fontSize: fontSizes[size] }]}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

export function Input({ label, error, containerStyle, style, ...props }: InputProps) {
  const { colors } = useTheme();

  return (
    <View style={[consolidatedStyles.inputContainer, containerStyle]}>
      {label && <Text style={[consolidatedStyles.inputLabel, { color: colors.textSecondary }]}>{label}</Text>}
      <TextInput
        {...props}
        placeholderTextColor={colors.inputPlaceholder}
        style={[
          consolidatedStyles.input,
          {
            backgroundColor: colors.inputBg,
            borderColor: error ? colors.error : colors.inputBorder,
            color: colors.inputText,
          },
          style,
        ]}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {error && <Text style={[consolidatedStyles.inputError, { color: colors.error }]}>{error}</Text>}
    </View>
  );
}

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
}

export function Card({ children, style, onPress }: CardProps) {
  const { colors } = useTheme();

  const cardStyle = [
    consolidatedStyles.card,
    {
      backgroundColor: colors.card,
      borderColor: colors.cardBorder,
    },
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [...cardStyle, { opacity: pressed ? 0.8 : 1 }]}
        accessibilityRole="button"
      >
        {children}
      </Pressable>
    );
  }

  return <View style={cardStyle}>{children}</View>;
}

interface BadgeProps {
  label: string;
  color?: string;
  backgroundColor?: string;
}

export function Badge({ label, color, backgroundColor }: BadgeProps) {
  const { colors } = useTheme();

  return (
    <View style={[consolidatedStyles.badge, { backgroundColor: backgroundColor || colors.accentBg }]} accessibilityRole="text" accessibilityLabel={label}>
      <Text style={[consolidatedStyles.badgeText, { color: color || colors.accent }]}>{label}</Text>
    </View>
  );
}

interface SectionHeaderProps {
  title: string;
  action?: { label: string; onPress: () => void };
}

export function SectionHeader({ title, action }: SectionHeaderProps) {
  const { colors } = useTheme();

  return (
    <View style={consolidatedStyles.sectionHeader}>
      <Text style={[consolidatedStyles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {action && (
        <Pressable onPress={action.onPress} accessibilityLabel={action.label} accessibilityRole="button">
          <Text style={[consolidatedStyles.sectionAction, { color: colors.accent }]}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={[consolidatedStyles.divider, { backgroundColor: colors.borderSubtle }]} />;
}

interface MenuItemProps {
  icon: string;
  label: string;
  subtitle?: string;
  onPress: () => void;
  badge?: string;
  destructive?: boolean;
}

export const MenuItem = React.memo(function MenuItem({ icon, label, subtitle, onPress, badge, destructive }: MenuItemProps) {
  const { colors } = useTheme();
  const IconComponent = APP_UI_ICONS[icon] ?? Circle;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        consolidatedStyles.menuItem,
        { backgroundColor: pressed ? colors.surfaceHover : 'transparent' },
      ]}
      accessibilityLabel={subtitle ? `${label}, ${subtitle}` : label}
      accessibilityRole="button"
    >
      <View style={[consolidatedStyles.menuIconContainer, { backgroundColor: colors.accentBg }]}>
        <IconComponent size={18} color={colors.accentLight} strokeWidth={2} />
      </View>
      <View style={consolidatedStyles.menuContent}>
        <Text style={[consolidatedStyles.menuLabel, { color: destructive ? colors.error : colors.text }]}>
          {label}
        </Text>
        {subtitle && (
          <Text style={[consolidatedStyles.menuSubtitle, { color: colors.textTertiary }]}>{subtitle}</Text>
        )}
      </View>
      {badge && <Badge label={badge} />}
      <ChevronRight size={20} color={colors.textTertiary} strokeWidth={2} />
    </Pressable>
  );
});

const consolidatedStyles = StyleSheet.create({
  button: {
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonText: {
    fontWeight: fontWeight.semibold,
  },
  inputContainer: {
    marginBottom: spacing.lg,
  },
  inputLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
    minHeight: 48,
  },
  inputError: {
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  sectionAction: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  divider: {
    height: 1,
    marginHorizontal: spacing.lg,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 52,
    gap: spacing.md,
  },
  menuIconContainer: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuContent: {
    flex: 1,
  },
  menuLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  menuSubtitle: {
    fontSize: fontSize.xs,
    marginTop: 1,
  },
});
