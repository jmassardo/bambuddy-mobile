// Bambuddy theme tokens aligned with the web UI palette.

export const colors = {
  dark: {
    background: '#1a1a1a',
    surface: '#2d2d2d',
    surfaceElevated: '#3d3d3d',
    surfaceHover: '#4a4a4a',
    border: '#3d3d3d',
    borderSubtle: '#353535',

    text: '#ffffff',
    textSecondary: '#a0a0a0',
    textTertiary: '#808080',
    textInverse: '#ffffff',

    accent: '#00AE42',
    accentDark: '#009438',
    accentLight: '#00C64D',
    accentBg: 'rgba(0, 174, 66, 0.18)',

    success: '#16a34a',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',

    statusIdle: '#16a34a',
    statusPrinting: '#3b82f6',
    statusPaused: '#f59e0b',
    statusError: '#ef4444',
    statusOffline: '#808080',
    statusMaintenance: '#f59e0b',

    highlight: '#a855f7',
    highlightLight: '#c4b5fd',
    highlightBg: 'rgba(168, 85, 247, 0.1)',
    infoBg: 'rgba(59, 130, 246, 0.13)',
    infoLight: '#67e8f9',

    card: '#2d2d2d',
    cardBorder: '#3d3d3d',

    inputBg: '#3d3d3d',
    inputBorder: '#4a4a4a',
    inputText: '#ffffff',
    inputPlaceholder: '#808080',

    tabBar: '#1a1a1a',
    tabBarBorder: '#2d2d2d',
    tabActive: '#00AE42',
    tabInactive: '#808080',

    overlay: 'rgba(0, 0, 0, 0.7)',
    modalBg: '#2d2d2d',
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
    textInverse: '#ffffff',

    accent: '#00AE42',
    accentDark: '#009438',
    accentLight: '#00C64D',
    accentBg: 'rgba(0, 174, 66, 0.12)',

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

    highlight: '#a855f7',
    highlightLight: '#c4b5fd',
    highlightBg: 'rgba(168, 85, 247, 0.1)',
    infoBg: 'rgba(59, 130, 246, 0.13)',
    infoLight: '#93c5fd',

    card: '#ffffff',
    cardBorder: '#e4e4e7',

    inputBg: '#f4f4f5',
    inputBorder: '#d4d4d8',
    inputText: '#09090b',
    inputPlaceholder: '#a1a1aa',

    tabBar: '#ffffff',
    tabBarBorder: '#e4e4e7',
    tabActive: '#00AE42',
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
