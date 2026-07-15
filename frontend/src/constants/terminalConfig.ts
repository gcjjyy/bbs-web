// Terminal canvas dimensions
export const CANVAS_WIDTH: number = 640
export const CANVAS_HEIGHT: number = 528

// Font metrics
export const FONT_WIDTH: number = 8
export const FONT_HEIGHT: number = 16
export const SCREEN_WIDTH: number = CANVAS_WIDTH / FONT_WIDTH
export const SCREEN_HEIGHT: number = 33

// Smart mouse border width
export const SMART_MOUSE_BORDER: number = 2

// Available display themes
export const DISPLAYS: readonly string[] = ['VGA', 'ACI', 'HERCULES'] as const

// Default selected font
export const DEFAULT_FONT: string = 'NeoDunggeunmo'
export const BOX_DRAWING_FONT: string = 'IyagiGGC'

// Maximum file size for upload (512MB)
export const MAX_FILE_SIZE: number = 512 * 1024 * 1024
