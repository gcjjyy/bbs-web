// Theme color palettes (16 colors each)
export type ThemeName = 'VGA' | 'ACI' | 'HERCULES'
export type ThemeColors = readonly string[]
export type ThemeMap = Record<ThemeName, ThemeColors>

const THEMES: ThemeMap = {
  VGA: [
    '#000000', // Black
    '#000080', // Blue
    '#008000', // Green
    '#008080', // Cyan
    '#800000', // Red
    '#800080', // Magenta
    '#804000', // Brown
    '#808080', // Light gray
    '#404040', // Gray
    '#4040ff', // Light blue
    '#40ff40', // Light green
    '#40ffff', // Light cyan
    '#ff4040', // Light red
    '#ff40ff', // Light magenta
    '#ffff40', // Yellow
    '#ffffff' // White
  ],
  ACI: [
    '#363636',
    '#0d1926',
    '#83ff08',
    '#ff8308',
    '#0883ff',
    '#8308ff',
    '#08ff83',
    '#b6b6b6',
    '#424242',
    '#ff1e8e',
    '#8eff1e',
    '#ff8e1e',
    '#1e8eff',
    '#8e1eff',
    '#1eff8e',
    '#e4f4ff'
  ],
  HERCULES: [
    '#000000',
    '#000000',
    '#808080',
    '#808080',
    '#808080',
    '#808080',
    '#808080',
    '#a0a0a0',
    '#a0a0a0',
    '#808080',
    '#a0a0a0',
    '#a0a0a0',
    '#a0a0a0',
    '#a0a0a0',
    '#ffffff',
    '#ffffff'
  ]
}

export default THEMES
