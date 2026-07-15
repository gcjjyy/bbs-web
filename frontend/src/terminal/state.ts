import {
  CANVAS_WIDTH,
  FONT_WIDTH,
  SCREEN_HEIGHT
} from '../constants/terminalConfig'
import THEMES, { ThemeName } from '../themes'
import type { TerminalState } from '../types/terminal'

export const MAX_TERMINAL_HISTORY_CHARS =
  (CANVAS_WIDTH / FONT_WIDTH) * SCREEN_HEIGHT * 4

// Module-level mutable state for terminal emulation
// These need to be module-level because they're mutated synchronously during rendering
export const terminalState: TerminalState = {
  io: null,
  ctx2d: null,
  rate: 1.0,
  selectedDisplay: 'VGA',
  selectedFont: 'NeoDunggeunmo',
  escape: null,
  cursor: { x: 0, y: 0 },
  cursorStore: { x: 0, y: 0 },
  attr: { textColor: 15, backgroundColor: 1, reversed: false },
  lastPageText: '',
  lastPageTextPos: [],
  smartMouse: [],
  smartMouseCmd: null,
  applicationCursorKeys: false,
  autoWrapMode: true,
  wrapPending: false,
  windowTop: 0,
  windowBottom: SCREEN_HEIGHT - 1,
  COLOR: []
}

// Initialize COLOR array from theme
export const initializeColors = (display: ThemeName = 'VGA'): void => {
  for (let i = 0; i < 16; i++) {
    terminalState.COLOR[i] = THEMES[display][i]
  }
}

export const trimTerminalHistory = (): void => {
  const overflow =
    terminalState.lastPageText.length - MAX_TERMINAL_HISTORY_CHARS

  if (overflow <= 0) return

  terminalState.lastPageText = terminalState.lastPageText.slice(overflow)
  terminalState.lastPageTextPos = terminalState.lastPageTextPos.slice(overflow)
}

export const setTerminalHistory = (
  text: string,
  positions: TerminalState['lastPageTextPos']
): void => {
  terminalState.lastPageText = text
  terminalState.lastPageTextPos = positions
  trimTerminalHistory()
}

export const appendTerminalHistory = (
  text: string,
  position: TerminalState['lastPageTextPos'][number]
): void => {
  terminalState.lastPageText += text
  terminalState.lastPageTextPos.push(position)
  trimTerminalHistory()
}

// Reset terminal state
export const resetTerminalState = (): void => {
  terminalState.escape = null
  terminalState.cursor = { x: 0, y: 0 }
  terminalState.cursorStore = { x: 0, y: 0 }
  terminalState.attr = { textColor: 15, backgroundColor: 1, reversed: false }
  terminalState.lastPageText = ''
  terminalState.lastPageTextPos = []
  terminalState.smartMouse = []
  terminalState.smartMouseCmd = null
  terminalState.applicationCursorKeys = false
  terminalState.autoWrapMode = true
  terminalState.wrapPending = false
  terminalState.windowTop = 0
  terminalState.windowBottom = SCREEN_HEIGHT - 1
}
