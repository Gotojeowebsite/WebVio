/**
 * WebVio / Windows Nuvio Design System Tokens
 * Fluent Windows Desktop aesthetic with Mica, Acrylic, Glowing Accents, and High Contrast Dark Theme.
 */

export const colors = {
  // Base background palette (Windows Fluent Dark: #0A0A0A to #141414)
  bg: {
    base: '#0A0A0A',
    subtle: '#0E0E10',
    elevated: '#121214',
    surface: '#141416',
    card: '#18181B',
    cardHover: '#202024',
    mica: 'rgba(10, 10, 12, 0.88)',
    glass: 'rgba(14, 14, 16, 0.82)',
    acrylic: 'rgba(20, 20, 26, 0.70)',
    overlay: 'rgba(0, 0, 0, 0.75)',
  },

  // Semi-transparent surface overlays (0.04 to 0.08 default)
  surface: {
    subtle: 'rgba(255, 255, 255, 0.04)',
    muted: 'rgba(255, 255, 255, 0.06)',
    default: 'rgba(255, 255, 255, 0.08)',
    hover: 'rgba(255, 255, 255, 0.12)',
    active: 'rgba(255, 255, 255, 0.16)',
    selected: 'rgba(0, 212, 255, 0.14)',
  },

  // Signature Accent Colors
  accent: {
    // Primary Cyan / Teal
    cyan: '#00D4FF',
    cyanLight: '#38E1FF',
    cyanDark: '#0099CC',
    cyanGlow: 'rgba(0, 212, 255, 0.40)',
    cyanSubtle: 'rgba(0, 212, 255, 0.12)',
    cyanBorder: 'rgba(0, 212, 255, 0.35)',

    // Secondary Orange / Amber
    orange: '#FF6B00',
    orangeLight: '#FF8833',
    orangeDark: '#CC5500',
    orangeGlow: 'rgba(255, 107, 0, 0.40)',
    orangeSubtle: 'rgba(255, 107, 0, 0.12)',
    orangeBorder: 'rgba(255, 107, 0, 0.35)',

    // Legacy Violet compatibility mapped to vibrant Cyan-Violet gradient
    violet: '#00D4FF',
    magenta: '#FF6B00',
  },

  // High-contrast Windows text hierarchy
  text: {
    primary: '#FFFFFF',
    secondary: '#B3B3B3',
    muted: '#888888',
    dim: '#555555',
    inverse: '#0A0A0A',
    accentCyan: '#00D4FF',
    accentOrange: '#FF6B00',
  },

  // Status & indicators
  status: {
    success: '#00E676',
    successBg: 'rgba(0, 230, 118, 0.15)',
    successBorder: 'rgba(0, 230, 118, 0.35)',
    warning: '#FFB800',
    warningBg: 'rgba(255, 184, 0, 0.15)',
    warningBorder: 'rgba(255, 184, 0, 0.35)',
    error: '#FF3B30',
    errorBg: 'rgba(255, 59, 48, 0.15)',
    errorBorder: 'rgba(255, 59, 48, 0.35)',
    info: '#00D4FF',
    infoBg: 'rgba(0, 212, 255, 0.15)',
    infoBorder: 'rgba(0, 212, 255, 0.35)',
  },

  // Windows glassmorphism & specular borders
  border: {
    subtle: 'rgba(255, 255, 255, 0.06)',
    default: 'rgba(255, 255, 255, 0.10)',
    strong: 'rgba(255, 255, 255, 0.18)',
    specular: 'rgba(255, 255, 255, 0.22)',
    focusCyan: 'rgba(0, 212, 255, 0.60)',
    focusOrange: 'rgba(255, 107, 0, 0.60)',
  },

  // Fluent Gradients
  gradients: {
    cyan: 'linear-gradient(135deg, #00D4FF 0%, #0070F3 100%)',
    orange: 'linear-gradient(135deg, #FF6B00 0%, #FF9E00 100%)',
    cyanOrange: 'linear-gradient(135deg, #00D4FF 0%, #FF6B00 100%)',
    micaSurface: 'linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.02) 100%)',
    card: 'linear-gradient(145deg, rgba(26, 26, 30, 0.85) 0%, rgba(14, 14, 16, 0.95) 100%)',
    glassHighlight: 'linear-gradient(180deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.02) 100%)',
  },
} as const;

export const typography = {
  fontFamily: {
    base: "'Segoe UI Variable Text', 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Outfit', 'Inter', system-ui, sans-serif",
    display: "'Segoe UI Variable Display', 'Segoe UI', 'Outfit', system-ui, sans-serif",
    mono: "'Cascadia Code', 'Consolas', 'Fira Code', monospace",
  },
  fontSize: {
    xs: '0.75rem',     // 12px
    sm: '0.875rem',    // 14px
    base: '1rem',      // 16px
    md: '1.125rem',    // 18px
    lg: '1.25rem',     // 20px
    xl: '1.5rem',      // 24px
    '2xl': '1.875rem', // 30px
    '3xl': '2.25rem',  // 36px
    '4xl': '3rem',     // 48px
    hero: 'clamp(2.25rem, 1.6rem + 3vw, 4rem)',
  },
  fontWeight: {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },
  lineHeight: {
    none: '1',
    tight: '1.2',
    snug: '1.35',
    normal: '1.5',
    relaxed: '1.65',
    loose: '2',
  },
  letterSpacing: {
    tighter: '-0.04em',
    tight: '-0.02em',
    normal: '0em',
    wide: '0.02em',
    wider: '0.05em',
    widest: '0.1em',
  },
} as const;

export const spacing = {
  0: '0px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  7: '28px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
  20: '80px',
  24: '96px',
} as const;

export const radii = {
  none: '0px',
  xs: '4px',
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '20px',
  '3xl': '24px',
  pill: '9999px',
  full: '9999px',
} as const;

export const shadows = {
  none: 'none',
  sm: '0 1px 3px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3)',
  md: '0 4px 16px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3)',
  lg: '0 12px 32px rgba(0, 0, 0, 0.65), 0 4px 12px rgba(0, 0, 0, 0.4)',
  xl: '0 24px 64px rgba(0, 0, 0, 0.8), 0 8px 24px rgba(0, 0, 0, 0.5)',
  glowCyan: '0 0 20px rgba(0, 212, 255, 0.35), 0 0 40px rgba(0, 212, 255, 0.15)',
  glowOrange: '0 0 20px rgba(255, 107, 0, 0.35), 0 0 40px rgba(255, 107, 0, 0.15)',
  focusRingCyan: '0 0 0 2px #0A0A0A, 0 0 0 4px #00D4FF, 0 0 16px rgba(0, 212, 255, 0.5)',
  focusRingOrange: '0 0 0 2px #0A0A0A, 0 0 0 4px #FF6B00, 0 0 16px rgba(255, 107, 0, 0.5)',
  innerGlass: 'inset 0 1px 0 rgba(255, 255, 255, 0.12), inset 0 -1px 0 rgba(0, 0, 0, 0.3)',
} as const;

export const glassmorphism = {
  blurSm: 'blur(8px)',
  blurMd: 'blur(16px)',
  blurLg: 'blur(28px)',
  blurXl: 'blur(40px)',
  mica: 'blur(40px) saturate(160%)',
  acrylic: 'blur(30px) saturate(140%)',
} as const;

export const transitions = {
  fast: '150ms cubic-bezier(0.1, 0.9, 0.2, 1)',
  normal: '250ms cubic-bezier(0.1, 0.9, 0.2, 1)',
  slow: '400ms cubic-bezier(0.1, 0.9, 0.2, 1)',
  spring: '350ms cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  easeFluent: 'cubic-bezier(0.1, 0.9, 0.2, 1)',
  easeEntrance: 'cubic-bezier(0, 0, 0, 1)',
  easeExit: 'cubic-bezier(0.7, 0.1, 1, 1)',
} as const;

export const zIndex = {
  base: 0,
  elevated: 10,
  dropdown: 1000,
  sticky: 1100,
  sidebar: 1200,
  navbar: 1300,
  modal: 1400,
  toast: 1500,
  tooltip: 1600,
} as const;

export type ThemeColors = typeof colors;
export type ThemeTypography = typeof typography;
export type ThemeSpacing = typeof spacing;
export type ThemeRadii = typeof radii;
export type ThemeShadows = typeof shadows;
export type ThemeGlassmorphism = typeof glassmorphism;
export type ThemeTransitions = typeof transitions;

export const designTokens = {
  colors,
  typography,
  spacing,
  radii,
  shadows,
  glassmorphism,
  transitions,
  zIndex,
} as const;

export default designTokens;
