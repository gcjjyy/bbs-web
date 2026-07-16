import {
  DEFAULT_FONT,
  FONT_HEIGHT,
  FONT_WIDTH,
  SCREEN_HEIGHT,
  SCREEN_WIDTH
} from '../constants/terminalConfig'
import {
  getTerminalCanvasFont,
  getTerminalFontForChar
} from '../utils/terminalFont'
import { terminalState } from './state'

let overlayCanvas: HTMLCanvasElement | null = null
let compositionText = ''
let cursorVisible = true
let cursorBlinkTimer: ReturnType<typeof setInterval> | null = null

const CURSOR_WIDTH = 8
const CURSOR_HEIGHT = 16
const CURSOR_TOP_OFFSET = (FONT_HEIGHT - CURSOR_HEIGHT) / 2
const CURSOR_COLOR = '#ffff00'
const CURSOR_BLINK_INTERVAL_MS = 675

const restartCursorBlink = (): void => {
  if (cursorBlinkTimer !== null) {
    clearInterval(cursorBlinkTimer)
    cursorBlinkTimer = null
  }

  cursorVisible = true
  if (!overlayCanvas) return

  cursorBlinkTimer = setInterval(() => {
    cursorVisible = !cursorVisible
    renderTerminalInputOverlay()
  }, CURSOR_BLINK_INTERVAL_MS)
}

const getInputColors = (): { text: string; background: string } => {
  const { attr, COLOR } = terminalState
  const text = COLOR[attr.textColor] ?? '#ffffff'
  const background = COLOR[attr.backgroundColor] ?? '#000000'

  return attr.reversed
    ? { text: background, background: text }
    : { text, background }
}

const movePreviewToNextLine = (
  position: { x: number; y: number }
): void => {
  position.x = 0
  position.y = Math.min(position.y + 1, SCREEN_HEIGHT - 1)
}

export const renderTerminalInputOverlay = (): void => {
  if (!overlayCanvas) return

  const ctx = overlayCanvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)

  const position = { ...terminalState.cursor }
  const colors = getInputColors()
  let wrapPending = terminalState.wrapPending

  for (const ch of compositionText) {
    const charWidth = ch.charCodeAt(0) < 0x80 ? 1 : 2

    if (wrapPending || position.x + charWidth > SCREEN_WIDTH) {
      movePreviewToNextLine(position)
      wrapPending = false
    }

    const px = position.x * FONT_WIDTH
    const py = position.y * FONT_HEIGHT

    ctx.fillStyle = colors.background
    ctx.fillRect(px, py, charWidth * FONT_WIDTH, FONT_HEIGHT)
    ctx.fillStyle = colors.text
    ctx.font = getTerminalCanvasFont(getTerminalFontForChar(ch))
    ctx.textBaseline = 'top'
    ctx.fillText(ch, px, py)
    ctx.fillRect(
      px,
      py + FONT_HEIGHT - 1,
      charWidth * FONT_WIDTH,
      1
    )

    const nextX = position.x + charWidth
    if (nextX >= SCREEN_WIDTH) {
      position.x = SCREEN_WIDTH - 1
      wrapPending = true
    } else {
      position.x = nextX
    }
  }

  if (cursorVisible) {
    ctx.fillStyle = CURSOR_COLOR
    ctx.fillRect(
      position.x * FONT_WIDTH,
      position.y * FONT_HEIGHT + CURSOR_TOP_OFFSET,
      CURSOR_WIDTH,
      CURSOR_HEIGHT
    )
  }
}

export const refreshTerminalInputOverlay = (): void => {
  restartCursorBlink()
  renderTerminalInputOverlay()
}

export const setupTerminalInputOverlay = (
  canvas: HTMLCanvasElement | null
): void => {
  overlayCanvas = canvas
  compositionText = ''
  restartCursorBlink()

  if (overlayCanvas) {
    const ctx = overlayCanvas.getContext('2d')
    if (ctx) {
      ctx.font = getTerminalCanvasFont(DEFAULT_FONT)
      ctx.textBaseline = 'top'
    }
  }

  renderTerminalInputOverlay()
}

export const setTerminalComposition = (text: string): void => {
  compositionText = text
  refreshTerminalInputOverlay()
}
