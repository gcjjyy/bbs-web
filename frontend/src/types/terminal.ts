import type { Socket } from 'socket.io-client'

// Cursor position
export interface Cursor {
  x: number
  y: number
}

// Text attributes for terminal
export interface TextAttribute {
  textColor: number
  backgroundColor: number
  reversed: boolean
}

// Cursor store with optional text attributes
export interface CursorStore extends Cursor {
  textColor?: number
  backgroundColor?: number
}

// Smart mouse link for clickable areas
export interface SmartMouseLink {
  command: string
  px: {
    x: number
    y: number
    width: number
    height: number
  }
}

// Terminal state (module-level mutable state)
export interface TerminalState {
  io: Socket | null
  ctx2d: CanvasRenderingContext2D | null
  rate: number
  selectedDisplay: string
  selectedFont: string
  escape: string | null
  cursor: Cursor
  cursorStore: CursorStore
  attr: TextAttribute
  lastPageText: string
  lastPageTextPos: Cursor[]
  smartMouse: SmartMouseLink[]
  smartMouseCmd: string | null
  applicationCursorKeys: boolean
  windowTop: number
  windowBottom: number
  COLOR: string[]
}

// Smart mouse pattern configuration
export interface SmartMousePattern {
  pattern: RegExp
  captureOnly: boolean
}
