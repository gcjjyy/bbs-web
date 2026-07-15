import {
  CANVAS_WIDTH,
  DEFAULT_FONT,
  FONT_WIDTH,
  FONT_HEIGHT,
  SCREEN_HEIGHT
} from '../constants/terminalConfig'
import {
  appendTerminalHistory,
  setTerminalHistory,
  terminalState
} from './useTerminalState'
import { scheduleSmartMouseRebuild } from './useSmartMouse'
import type { RefObject } from 'react'
import {
  getTerminalCanvasFont,
  getTerminalFontForChar
} from '../utils/terminalFont'

// Apply ANSI escape sequence
interface WriteOptions {
  recordHistory?: boolean
}

const applyEscape = (
  terminalRef: RefObject<HTMLCanvasElement | null>,
  recordHistory: boolean
): void => {
  const { ctx2d, cursor, cursorStore, attr, escape, COLOR } = terminalState

  if (!ctx2d || !escape) return

  // Special block characters (from non-standard EUC-KR)
  // Pattern: ESC[=9XXB where XX is block type (01=full, 02=upper half, etc.)
  {
    const pattern = /\[=9([0-9]{2})B/
    const result = pattern.exec(escape)
    if (result) {
      const blockType = parseInt(result[1], 10)
      const cursor_px = {
        x: cursor.x * FONT_WIDTH,
        y: cursor.y * FONT_HEIGHT
      }
      let textColor = COLOR[attr.textColor]
      let backgroundColor = COLOR[attr.backgroundColor]
      if (attr.reversed) {
        textColor = COLOR[attr.backgroundColor]
        backgroundColor = COLOR[attr.textColor]
      }

      // Draw 2-column wide block (original EUC-KR char was 2-byte wide)
      const blockWidth = 2 * FONT_WIDTH
      const blockHeight = FONT_HEIGHT

      // Clear background first
      ctx2d.fillStyle = backgroundColor
      ctx2d.fillRect(cursor_px.x, cursor_px.y, blockWidth, blockHeight)

      // Draw the block based on type
      ctx2d.fillStyle = textColor
      switch (blockType) {
        case 1: // Full block (901)
          ctx2d.fillRect(cursor_px.x, cursor_px.y, blockWidth, blockHeight)
          break
        case 2: // Upper half block (902)
          ctx2d.fillRect(cursor_px.x, cursor_px.y, blockWidth, blockHeight / 2)
          break
        case 3: // Lower half block (903)
          ctx2d.fillRect(cursor_px.x, cursor_px.y + blockHeight / 2, blockWidth, blockHeight / 2)
          break
        case 4: // Left half block (904)
          ctx2d.fillRect(cursor_px.x, cursor_px.y, blockWidth / 2, blockHeight)
          break
        case 5: // Right half block (905)
          ctx2d.fillRect(cursor_px.x + blockWidth / 2, cursor_px.y, blockWidth / 2, blockHeight)
          break
        default: // Unknown block type, draw full block
          ctx2d.fillRect(cursor_px.x, cursor_px.y, blockWidth, blockHeight)
      }

      // Advance cursor by 2 columns
      cursor.x += 2
      return // Don't process other escape handlers
    }
  }

  // Text color
  {
    const pattern = /\[=([0-9]*)F/
    const result = pattern.exec(escape)
    if (result) {
      const param1 = parseInt(result[1], 10)
      attr.textColor = isNaN(param1) ? 15 : param1
    }
  }

  // Background color
  {
    const pattern = /\[=([0-9]*)G/
    const result = pattern.exec(escape)
    if (result) {
      const param1 = parseInt(result[1], 10)
      attr.backgroundColor = isNaN(param1) ? 1 : param1
    }
  }

  // Reverse color
  {
    const pattern = /\[([0-9;]*)m/
    const result = pattern.exec(escape)
    if (result) {
      const attrs = result[1].split(';')
      for (const attrCode of attrs) {
        if (!attrCode || parseInt(attrCode, 10) === 0) {
          // Reset All Attributes
          attr.reversed = false
          attr.textColor = 15
          attr.backgroundColor = 1
        } else {
          switch (parseInt(attrCode, 10)) {
            case 1: // Bold (not fully supported)
            case 2: // Dim (not supported)
            case 4: // Underline (not supported)
            case 5: // Blink (not supported)
            case 8: // Hidden (not supported)
            case 22: // Bold/Dim off
            case 24: // Underline off
            case 25: // Blink off
            case 28: // Hidden off
              break
            case 7: // Reverse video on
              attr.reversed = true
              break
            case 27: // Reverse video off
              attr.reversed = false
              break
            case 30: attr.textColor = 0; break
            case 31: attr.textColor = 4; break
            case 32: attr.textColor = 2; break
            case 33: attr.textColor = 14; break
            case 34: attr.textColor = 1; break
            case 35: attr.textColor = 5; break
            case 36: attr.textColor = 3; break
            case 37: attr.textColor = 15; break
            case 40: attr.backgroundColor = 0; break
            case 41: attr.backgroundColor = 4; break
            case 42: attr.backgroundColor = 2; break
            case 43: attr.backgroundColor = 14; break
            case 44: attr.backgroundColor = 1; break
            case 45: attr.backgroundColor = 5; break
            case 46: attr.backgroundColor = 3; break
            case 47: attr.backgroundColor = 15; break
            // Bright foreground colors (90-97)
            case 90: attr.textColor = 8; break
            case 91: attr.textColor = 12; break
            case 92: attr.textColor = 10; break
            case 93: attr.textColor = 14; break
            case 94: attr.textColor = 9; break
            case 95: attr.textColor = 13; break
            case 96: attr.textColor = 11; break
            case 97: attr.textColor = 15; break
            // Bright background colors (100-107)
            case 100: attr.backgroundColor = 8; break
            case 101: attr.backgroundColor = 12; break
            case 102: attr.backgroundColor = 10; break
            case 103: attr.backgroundColor = 14; break
            case 104: attr.backgroundColor = 9; break
            case 105: attr.backgroundColor = 13; break
            case 106: attr.backgroundColor = 11; break
            case 107: attr.backgroundColor = 15; break
            default:
              attr.reversed = false
              attr.textColor = 15
              attr.backgroundColor = 1
              break
          }
        }
      }
    }
  }

  // Move cursor to specific position (H or f)
  {
    const pattern = /\[([0-9]*);([0-9]*)[Hf]/
    const result = pattern.exec(escape)
    if (result) {
      const param1 = parseInt(result[1], 10)
      const param2 = parseInt(result[2], 10)
      cursor.y = isNaN(param1) ? 0 : param1 - 1
      cursor.x = isNaN(param2) ? 0 : param2 - 1
    } else {
      const pattern2 = /\[([0-9]*)[Hf]/
      const result2 = pattern2.exec(escape)
      if (result2) {
        const param1 = parseInt(result2[1], 10)
        cursor.y = isNaN(param1) ? 0 : param1 - 1
        cursor.x = 0
      }
    }
  }

  // Move cursor up
  {
    const pattern = /\[([0-9]*)A/
    const result = pattern.exec(escape)
    if (result) {
      const param1 = parseInt(result[1], 10)
      cursor.y -= isNaN(param1) || param1 === 0 ? 1 : param1
      if (cursor.y < 0) {
        cursor.y = 0
        cursor.x = 0
      }
    }
  }

  // Move cursor right
  {
    const pattern = /\[([0-9]*)C/
    const result = pattern.exec(escape)
    if (result) {
      const param1 = parseInt(result[1], 10)
      cursor.x += isNaN(param1) || param1 === 0 ? 1 : param1
    }
  }

  // Move cursor down
  {
    const pattern = /\[([0-9]*)B/
    const result = pattern.exec(escape)
    if (result) {
      const param1 = parseInt(result[1], 10)
      cursor.y += isNaN(param1) || param1 === 0 ? 1 : param1
      if (cursor.y >= SCREEN_HEIGHT) {
        cursor.y = SCREEN_HEIGHT - 1
      }
    }
  }

  // Move cursor left
  {
    const pattern = /\[([0-9]*)D/
    const result = pattern.exec(escape)
    if (result) {
      const param1 = parseInt(result[1], 10)
      cursor.x -= isNaN(param1) || param1 === 0 ? 1 : param1
      if (cursor.x < 0) {
        cursor.x = 0
      }
    }
  }

  // Cursor Next Line
  {
    const pattern = /\[([0-9]*)E/
    const result = pattern.exec(escape)
    if (result) {
      const param1 = parseInt(result[1], 10)
      cursor.y += isNaN(param1) || param1 === 0 ? 1 : param1
      cursor.x = 0
      if (cursor.y >= SCREEN_HEIGHT) {
        cursor.y = SCREEN_HEIGHT - 1
      }
    }
  }

  // Cursor Previous Line
  {
    const pattern = /\[([0-9]*)F/
    const result = pattern.exec(escape)
    if (result) {
      const param1 = parseInt(result[1], 10)
      cursor.y -= isNaN(param1) || param1 === 0 ? 1 : param1
      cursor.x = 0
      if (cursor.y < 0) {
        cursor.y = 0
      }
    }
  }

  // Store and restore cursor position
  if (escape.endsWith('[s')) {
    terminalState.cursorStore = {
      x: cursor.x,
      y: cursor.y,
      textColor: attr.textColor,
      backgroundColor: attr.backgroundColor
    }
  } else if (escape.endsWith('[u')) {
    cursor.x = cursorStore.x
    cursor.y = cursorStore.y
    if (cursorStore.textColor !== undefined) {
      attr.textColor = cursorStore.textColor
    }
    if (cursorStore.backgroundColor !== undefined) {
      attr.backgroundColor = cursorStore.backgroundColor
    }
  }

  // Clear screen
  {
    const pattern = /\[([0-9]*)J/
    const result = pattern.exec(escape)
    if (result && terminalRef.current) {
      const param1 = result[1] === '' ? 0 : parseInt(result[1], 10)

      if (param1 === 2) {
        // Clear entire screen
        ctx2d.fillStyle = COLOR[attr.backgroundColor]
        ctx2d.fillRect(0, 0, terminalRef.current.width, terminalRef.current.height)

        // Clear whole webpage
        document.getElementsByTagName('body')[0].style.backgroundColor = COLOR[attr.backgroundColor]

        if (recordHistory) {
          // Keep the redraw buffer anchored at the last full-screen clear.
          setTerminalHistory('\x1b[2J', [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 }
          ])
        }
        cursor.x = 0
        cursor.y = 0
      } else if (param1 === 0) {
        // Clear from cursor to end of screen
        ctx2d.fillStyle = COLOR[attr.backgroundColor]
        ctx2d.fillRect(
          cursor.x * FONT_WIDTH,
          cursor.y * FONT_HEIGHT,
          terminalRef.current.width - cursor.x * FONT_WIDTH,
          FONT_HEIGHT
        )
        if (cursor.y < SCREEN_HEIGHT - 1) {
          ctx2d.fillRect(
            0,
            (cursor.y + 1) * FONT_HEIGHT,
            terminalRef.current.width,
            terminalRef.current.height - (cursor.y + 1) * FONT_HEIGHT
          )
        }
      } else if (param1 === 1) {
        // Clear from beginning of screen to cursor
        ctx2d.fillStyle = COLOR[attr.backgroundColor]
        if (cursor.y > 0) {
          ctx2d.fillRect(0, 0, terminalRef.current.width, cursor.y * FONT_HEIGHT)
        }
        ctx2d.fillRect(0, cursor.y * FONT_HEIGHT, (cursor.x + 1) * FONT_WIDTH, FONT_HEIGHT)
      }
    }
  }

  // Clear line
  if (terminalRef.current) {
    if (escape.endsWith('[2K')) {
      ctx2d.fillStyle = COLOR[attr.backgroundColor]
      ctx2d.fillRect(0, cursor.y * FONT_HEIGHT, terminalRef.current.width, FONT_HEIGHT)
    } else if (escape.endsWith('[1K')) {
      ctx2d.fillStyle = COLOR[attr.backgroundColor]
      ctx2d.fillRect(0, cursor.y * FONT_HEIGHT, (cursor.x + 1) * FONT_WIDTH, FONT_HEIGHT)
    } else if (escape.endsWith('[0K') || escape.endsWith('[K')) {
      ctx2d.fillStyle = COLOR[attr.backgroundColor]
      ctx2d.fillRect(
        cursor.x * FONT_WIDTH,
        cursor.y * FONT_HEIGHT,
        terminalRef.current.width - cursor.x * FONT_WIDTH,
        FONT_HEIGHT
      )
    }
  }

  // Set window area
  {
    const pattern = /\[([0-9]*);([0-9]*)r/
    const result = pattern.exec(escape)
    if (result) {
      const param1 = parseInt(result[1], 10)
      const param2 = parseInt(result[2], 10)
      const scrollFrom = isNaN(param1) ? 0 : param1 - 1
      const scrollTo = isNaN(param2) ? 0 : param2 - 1

      if (scrollFrom <= 0 && scrollTo <= 0) {
        terminalState.windowTop = 0
        terminalState.windowBottom = SCREEN_HEIGHT - 1
      } else {
        terminalState.windowTop = scrollFrom
        terminalState.windowBottom = scrollTo
      }
    }
  }
}

const endOfEscape = (): boolean => {
  if (!terminalState.escape) return false
  const lastChar = terminalState.escape.charAt(terminalState.escape.length - 1)
  return '@ABCDEFGHJKSfhlmprsu'.indexOf(lastChar) !== -1
}

const screenScrollUp = (): void => {
  const { ctx2d, attr, windowTop, windowBottom, COLOR } = terminalState

  if (!ctx2d) return

  // Self-copy with drawImage stays on the GPU; getImageData forces a
  // CPU pixel readback on every scrolled line
  const scrollHeight = FONT_HEIGHT * (windowBottom - windowTop)
  if (scrollHeight > 0) {
    ctx2d.drawImage(
      ctx2d.canvas,
      0, FONT_HEIGHT * (windowTop + 1), CANVAS_WIDTH, scrollHeight,
      0, FONT_HEIGHT * windowTop, CANVAS_WIDTH, scrollHeight
    )
  }
  ctx2d.fillStyle = COLOR[attr.backgroundColor]
  ctx2d.fillRect(0, windowBottom * FONT_HEIGHT, CANVAS_WIDTH, FONT_HEIGHT)

  // Modify the position of lastPageTextPos (scroll up)
  for (const pos of terminalState.lastPageTextPos) {
    if (pos.y >= windowTop && pos.y <= windowBottom) {
      pos.y--
    }
  }
}

const cr = (): void => { terminalState.cursor.x = 0 }

const lf = (): void => {
  if (++terminalState.cursor.y > terminalState.windowBottom) {
    terminalState.cursor.y = terminalState.windowBottom
    screenScrollUp()
  }
}

export const write = (
  text: string,
  terminalRef: RefObject<HTMLCanvasElement | null>,
  smartMouseBoxRef: RefObject<HTMLDivElement | null>,
  commandRef: RefObject<HTMLInputElement | null>,
  options: WriteOptions = {}
): void => {
  const { ctx2d, cursor, attr, COLOR } = terminalState
  const recordHistory = options.recordHistory ?? true

  if (!ctx2d) return

  for (const ch of text) {
    if (recordHistory) {
      appendTerminalHistory(ch, { x: cursor.x, y: cursor.y })
    }

    if (terminalState.escape) {
      terminalState.escape = terminalState.escape + ch
      if (endOfEscape()) {
        applyEscape(terminalRef, recordHistory)
        terminalState.escape = null
      }
    } else {
      switch (ch.charCodeAt(0)) {
        case 27:
          terminalState.escape = '\x1b'
          break

        case 13:
          cr()
          break

        case 10:
          lf()
          break

        case 0: // NULL
        case 24: // ZDLE
        case 17: // XON
        case 138: // LF (ZMODEM)
        case 65533: // Unknown
          break

        default:
          {
            const charWidth = ch.charCodeAt(0) < 0x80 ? 1 : 2
            const cursor_px = {
              x: cursor.x * FONT_WIDTH,
              y: cursor.y * FONT_HEIGHT
            }
            let textColor = COLOR[attr.textColor]
            let backgroundColor = COLOR[attr.backgroundColor]

            if (attr.reversed) {
              textColor = COLOR[attr.backgroundColor]
              backgroundColor = COLOR[attr.textColor]
            }

            ctx2d.fillStyle = backgroundColor
            ctx2d.fillRect(cursor_px.x, cursor_px.y, charWidth * FONT_WIDTH, FONT_HEIGHT)
            ctx2d.fillStyle = textColor
            const fontFamily = getTerminalFontForChar(ch)
            const shouldOverrideFont = fontFamily !== DEFAULT_FONT
            const previousFont = ctx2d.font

            if (shouldOverrideFont) {
              ctx2d.font = getTerminalCanvasFont(fontFamily)
            }

            ctx2d.fillText(ch, cursor_px.x, cursor_px.y)

            if (shouldOverrideFont) {
              ctx2d.font = previousFont
            }

            cursor.x += charWidth
          }
          break
      }
    }
  }

  // Rebuild smart mouse once output settles
  scheduleSmartMouseRebuild(smartMouseBoxRef)

  // Move the command textfield to the cursor position
  moveCommandInputPosition(terminalRef, commandRef)
}

export const replayTerminalHistory = (
  terminalRef: RefObject<HTMLCanvasElement | null>,
  smartMouseBoxRef: RefObject<HTMLDivElement | null>,
  commandRef: RefObject<HTMLInputElement | null>
): void => {
  const history = terminalState.lastPageText

  terminalState.escape = null
  terminalState.cursor = { x: 0, y: 0 }
  terminalState.cursorStore = { x: 0, y: 0 }
  terminalState.attr = { textColor: 15, backgroundColor: 1, reversed: false }
  terminalState.windowTop = 0
  terminalState.windowBottom = SCREEN_HEIGHT - 1

  if (terminalState.ctx2d && terminalRef.current) {
    terminalState.ctx2d.fillStyle =
      terminalState.COLOR[terminalState.attr.backgroundColor]
    terminalState.ctx2d.fillRect(
      0,
      0,
      terminalRef.current.width,
      terminalRef.current.height
    )
  }

  write(history, terminalRef, smartMouseBoxRef, commandRef, {
    recordHistory: false
  })
}

export const moveCommandInputPosition = (
  terminalRef: RefObject<HTMLCanvasElement | null>,
  commandRef: RefObject<HTMLInputElement | null>
): void => {
  if (!terminalRef.current || !commandRef.current) return

  const bcr = terminalRef.current.getBoundingClientRect()

  terminalState.rate = bcr.width / CANVAS_WIDTH
  const scaledCursorX = terminalState.cursor.x * FONT_WIDTH * terminalState.rate
  const scaledCursorY = terminalState.cursor.y * FONT_HEIGHT * terminalState.rate

  const tmLeft = bcr.left + window.pageXOffset
  const tmTop = bcr.top + window.pageYOffset
  const tmWidth = bcr.width

  const cmLeft = tmLeft + scaledCursorX
  const cmTop = tmTop + scaledCursorY - (20 - 16 * terminalState.rate) / 2
  const cmWidth = tmWidth - (cmLeft - tmLeft)

  commandRef.current.style.left = `${cmLeft}px`
  commandRef.current.style.top = `${cmTop}px`
  commandRef.current.style.width = `${cmWidth}px`

  commandRef.current.style.fontSize = `${16 * terminalState.rate}px`
  commandRef.current.style.height = '20px'
}
