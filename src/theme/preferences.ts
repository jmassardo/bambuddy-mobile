import { colors, type ThemeColors } from './tokens';

export const backgroundOptions = {
  dark: ['neutral', 'warm', 'cool', 'oled', 'slate', 'forest'],
  light: ['neutral', 'warm', 'cool'],
} as const;
export const accentOptions = ['green', 'teal', 'blue', 'orange', 'purple', 'red'] as const;
export const styleOptions = ['classic', 'glow', 'vibrant'] as const;
export type ThemeAccent = typeof accentOptions[number];
export type ThemeStyle = typeof styleOptions[number];
export interface ThemeCustomization {
  dark_background: typeof backgroundOptions.dark[number];
  light_background: typeof backgroundOptions.light[number];
  dark_accent: ThemeAccent;
  light_accent: ThemeAccent;
  dark_style: ThemeStyle;
  light_style: ThemeStyle;
}
export const DEFAULT_THEME: ThemeCustomization = {
  dark_background: 'neutral', light_background: 'neutral',
  dark_accent: 'green', light_accent: 'green', dark_style: 'classic', light_style: 'classic',
};

export function sanitizeTheme(value: Record<string, unknown>): ThemeCustomization {
  const result = { ...DEFAULT_THEME };
  for (const mode of ['dark', 'light'] as const) {
    const background = value[`${mode}_background`];
    const accent = value[`${mode}_accent`];
    const style = value[`${mode}_style`];
    if (typeof background === 'string' && (backgroundOptions[mode] as readonly string[]).includes(background)) {
      Object.assign(result, { [`${mode}_background`]: background });
    }
    if (typeof accent === 'string' && (accentOptions as readonly string[]).includes(accent)) {
      Object.assign(result, { [`${mode}_accent`]: accent });
    }
    if (typeof style === 'string' && (styleOptions as readonly string[]).includes(style)) {
      Object.assign(result, { [`${mode}_style`]: style });
    }
  }
  return result;
}

const backgrounds = {
  dark: {
    neutral: ['#1a1a1a', '#2d2d2d', '#3d3d3d'], warm: ['#211c19', '#302924', '#44382f'],
    cool: ['#151c25', '#222d3b', '#334155'], oled: ['#000000', '#101010', '#242424'],
    slate: ['#0f172a', '#1e293b', '#334155'], forest: ['#102019', '#1c3025', '#2b4535'],
  },
  light: {
    neutral: ['#ffffff', '#f4f4f5', '#e4e4e7'], warm: ['#fffaf3', '#f6eee3', '#e9ddcc'],
    cool: ['#f5f9ff', '#eaf1fa', '#d2deed'],
  },
};
const accents: Record<ThemeAccent, string> = {
  green: '#00AE42', teal: '#0d9488', blue: '#2563eb', orange: '#ea580c', purple: '#9333ea', red: '#dc2626',
};

export function customizedColors(mode: 'dark' | 'light', settings: ThemeCustomization): ThemeColors {
  const base: ThemeColors = colors[mode];
  if (settings[`${mode}_background`] === 'neutral' && settings[`${mode}_accent`] === 'green' && settings[`${mode}_style`] === 'classic') return base;
  const [background, surface, elevated] = backgrounds[mode][settings[`${mode}_background`] as keyof typeof backgrounds[typeof mode]];
  const accent = accents[settings[`${mode}_accent`]];
  const style = settings[`${mode}_style`];
  return {
    ...base, background, surface, surfaceElevated: elevated,
    tabBar: background, modalBg: surface, inputBg: elevated,
    card: mode === 'dark' ? surface : background,
    accent, accentDark: accent, accentLight: accent, tabActive: accent,
    accentBg: `${accent}${mode === 'dark' ? '2e' : '1f'}`,
    ...(style === 'glow' ? { cardBorder: `${accent}88`, border: `${accent}66`, inputBorder: `${accent}66` } : {}),
    ...(style === 'vibrant' ? { card: `${accent}${mode === 'dark' ? '22' : '0d'}`, cardBorder: accent, border: `${accent}77`, surfaceHover: `${accent}33` } : {}),
  };
}
