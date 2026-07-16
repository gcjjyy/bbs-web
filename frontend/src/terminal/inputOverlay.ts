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

  ctx.fillStyle = colors.text
  ctx.fillRect(
    position.x * FONT_WIDTH,
    position.y * FONT_HEIGHT,
    2,
    FONT_HEIGHT
  )
}

export const setupTerminalInputOverlay = (
  canvas: HTMLCanvasElement | null
): void => {
  overlayCanvas = canvas
  compositionText = ''

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
  renderTerminalInputOverlay()
}
