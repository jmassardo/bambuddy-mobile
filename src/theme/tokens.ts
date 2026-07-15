// Bambuddy dark theme — matches the web UI's zinc/emerald palette
// Supports light mode too but defaults to dark

export const colors = {
  dark: {
    // Backgrounds
    background: '#09090b',       // zinc-950
    surface: '#18181b',          // zinc-900
    surfaceElevated: '#27272a',  // zinc-800
    surfaceHover: '#3f3f46',     // zinc-700
    border: '#3f3f46',           // zinc-700
    borderSubtle: '#27272a',     // zinc-800

    // Text
    text: '#fafafa',             // zinc-50
    textSecondary: '#a1a1aa',    // zinc-400
    textTertiary: '#71717a',     // zinc-500
    textInverse: '#09090b',      // zinc-950

    // Accent (emerald)
    accent: '#10b981',           // emerald-500
    accentDark: '#059669',       // emerald-600
    accentLight: '#34d399',      // emerald-400
    accentBg: 'rgba(16, 185, 129, 0.1)',

    // Status colors
    success: '#22c55e',          // green-500
    warning: '#f59e0b',          // amber-500
    error: '#ef4444',            // red-500
    info: '#3b82f6',             // blue-500

    // Printer status
    statusIdle: '#22c55e',
    statusPrinting: '#3b82f6',
    statusPaused: '#f59e0b',
    statusError: '#ef4444',
    statusOffline: '#71717a',
    statusMaintenance: '#f59e0b',

    // Card
    card: '#18181b',
    cardBorder: '#27272a',

    // Input
    inputBg: '#27272a',
    inputBorder: '#3f3f46',
    inputText: '#fafafa',
    inputPlaceholder: '#71717a',

    // Tab bar
    tabBar: '#18181b',
    tabBarBorder: '#27272a',
    tabActive: '#10b981',
    tabInactive: '#71717a',

    // Modal
    overlay: 'rgba(0, 0, 0, 0.7)',
    modalBg: '#18181b',
  },
  light: {
    background: '#ffffff',
    surface: '#f4f4f5',          // zinc-100
    surfaceElevated: '#ffffff',
    surfaceHover: '#e4e4e7',     // zinc-200
    border: '#d4d4d8',           // zinc-300
    borderSubtle: '#e4e4e7',     // zinc-200

    text: '#09090b',
    textSecondary: '#52525b',    // zinc-600
    textTertiary: '#a1a1aa',     // zinc-400
    textInverse: '#fafafa',

    accent: '#10b981',
    accentDark: '#059669',
    accentLight: '#34d399',
    accentBg: 'rgba(16, 185, 129, 0.1)',

    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',

    statusIdle: '#22c55e',
    statusPrinting: '#3b82f6',
    statusPaused: '#f59e0b',
    statusError: '#ef4444',
    statusOffline: '#a1a1aa',
    statusMaintenance: '#f59e0b',

    card: '#ffffff',
    cardBorder: '#e4e4e7',

    inputBg: '#f4f4f5',
    inputBorder: '#d4d4d8',
    inputText: '#09090b',
    inputPlaceholder: '#a1a1aa',

    tabBar: '#ffffff',
    tabBarBorder: '#e4e4e7',
    tabActive: '#10b981',
    tabInactive: '#a1a1aa',

    overlay: 'rgba(0, 0, 0, 0.5)',
    modalBg: '#ffffff',
  },
} as const;

export type ThemeColors = typeof colors.dark | typeof colors.light;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
} as const;

export const borderRadius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  full: 9999,
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  lg: 17,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
} as const;

export const fontWeight = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};
