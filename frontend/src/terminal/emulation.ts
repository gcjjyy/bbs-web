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
} from './state'
import { scheduleSmartMouseRebuild } from './smartMouse'
import type { RefObject } from 'react'
import {
  getTerminalCanvasFont,
  getTerminalFontForChar
} from '../utils/terminalFont'

// Apply ANSI escape sequence
interface WriteOptions {
  recordHistory?: boolean
}

// SGR (ESC[...m) code -> palette index
const SGR_TEXT_COLORS: Record<number, number> = {
  30: 0, 31: 4, 32: 2, 33: 14, 34: 1, 35: 5, 36: 3, 37: 15,
  90: 8, 91: 12, 92: 10, 93: 14, 94: 9, 95: 13, 96: 11, 97: 15
}
const SGR_BACKGROUND_COLORS: Record<number, number> = {
  40: 0, 41: 4, 42: 2, 43: 14, 44: 1, 45: 5, 46: 3, 47: 15,
  100: 8, 101: 12, 102: 10, 103: 14, 104: 9, 105: 13, 106: 11, 107: 15
}
// Bold, dim, underline, blink, hidden and their "off" codes: accepted
// but not rendered
const SGR_IGNORED = new Set([1, 2, 4, 5, 8, 22, 24, 25, 28])

const resetAttributes = (): void => {
  const { attr } = terminalState
  attr.reversed = false
  attr.textColor = 15
  attr.backgroundColor = 1
}

const applySgr = (parts: string[]): void => {
  const { attr } = terminalState

  for (const part of parts) {
    const code = parseInt(part, 10)
    if (!part || code === 0) {
      resetAttributes()
    } else if (SGR_IGNORED.has(code)) {
      // Not rendered
    } else if (code === 7) {
      attr.reversed = true
    } else if (code === 27) {
      attr.reversed = false
    } else if (code in SGR_TEXT_COLORS) {
      attr.textColor = SGR_TEXT_COLORS[code]
    } else if (code in SGR_BACKGROUND_COLORS) {
      attr.backgroundColor = SGR_BACKGROUND_COLORS[code]
    } else {
      // Unknown code resets everything (historical behavior)
      resetAttributes()
    }
  }
}

// Draw a non-standard EUC-KR block character: ESC[=9XXB where XX is
// 01=full, 02=upper half, 03=lower half, 04=left half, 05=right half
const drawBlock = (blockType: number): void => {
  const { ctx2d, cursor, attr, COLOR } = terminalState
  if (!ctx2d) return

  const x = cursor.x * FONT_WIDTH
  const y = cursor.y * FONT_HEIGHT
  let textColor = COLOR[attr.textColor]
  let backgroundColor = COLOR[attr.backgroundColor]
  if (attr.reversed) {
    textColor = COLOR[attr.backgroundColor]
    backgroundColor = COLOR[attr.textColor]
  }

  // 2-column wide block (original EUC-KR char was 2 bytes wide)
  const width = 2 * FONT_WIDTH
  const height = FONT_HEIGHT

  ctx2d.fillStyle = backgroundColor
  ctx2d.fillRect(x, y, width, height)

  ctx2d.fillStyle = textColor
  switch (blockType) {
    case 2: // Upper half block (902)
      ctx2d.fillRect(x, y, width, height / 2)
      break
    case 3: // Lower half block (903)
      ctx2d.fillRect(x, y + height / 2, width, height / 2)
      break
    case 4: // Left half block (904)
      ctx2d.fillRect(x, y, width / 2, height)
      break
    case 5: // Right half block (905)
      ctx2d.fillRect(x + width / 2, y, width / 2, height)
      break
    default: // Full block (901) and unknown types
      ctx2d.fillRect(x, y, width, height)
  }

  // Advance cursor by 2 columns
  cursor.x += 2
}

const clearScreen = (
  mode: number,
  terminalRef: RefObject<HTMLCanvasElement | null>,
  recordHistory: boolean
): void => {
  const { ctx2d, cursor, attr, COLOR } = terminalState
  if (!ctx2d || !terminalRef.current) return

  ctx2d.fillStyle = COLOR[attr.backgroundColor]

  if (mode === 2) {
    // Clear entire screen
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
  } else if (mode === 0) {
    // Clear from cursor to end of screen
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
  } else if (mode === 1) {
    // Clear from beginning of screen to cursor
    if (cursor.y > 0) {
      ctx2d.fillRect(0, 0, terminalRef.current.width, cursor.y * FONT_HEIGHT)
    }
    ctx2d.fillRect(0, cursor.y * FONT_HEIGHT, (cursor.x + 1) * FONT_WIDTH, FONT_HEIGHT)
  }
}

const clearLine = (
  mode: number,
  terminalRef: RefObject<HTMLCanvasElement | null>
): void => {
  const { ctx2d, cursor, attr, COLOR } = terminalState
  if (!ctx2d || !terminalRef.current) return

  ctx2d.fillStyle = COLOR[attr.backgroundColor]

  if (mode === 2) {
    // Whole line
    ctx2d.fillRect(0, cursor.y * FONT_HEIGHT, terminalRef.current.width, FONT_HEIGHT)
  } else if (mode === 1) {
    // Beginning of line to cursor
    ctx2d.fillRect(0, cursor.y * FONT_HEIGHT, (cursor.x + 1) * FONT_WIDTH, FONT_HEIGHT)
  } else if (mode === 0) {
    // Cursor to end of line
    ctx2d.fillRect(
      cursor.x * FONT_WIDTH,
      cursor.y * FONT_HEIGHT,
      terminalRef.current.width - cursor.x * FONT_WIDTH,
      FONT_HEIGHT
    )
  }
}

const applyEscape = (
  terminalRef: RefObject<HTMLCanvasElement | null>,
  recordHistory: boolean
): void => {
  const { ctx2d, cursor, cursorStore, attr, escape } = terminalState

  if (!ctx2d || !escape) return

  // Only CSI sequences (ESC [ ... final-char) are handled
  if (escape.charAt(1) !== '[') return

  const finalChar = escape.charAt(escape.length - 1)
  let paramStr = escape.slice(2, -1)

  // '=' marks this project's private sequences (colors, block chars)
  const isPrivate = paramStr.startsWith('=')
  if (isPrivate) {
    paramStr = paramStr.slice(1)
  }

  const parts = paramStr.split(';')
  const params = parts.map((part) => parseInt(part, 10))
  // Numeric parameter with a fallback for missing/empty values
  const param = (index: number, fallback: number): number =>
    Number.isNaN(params[index]) || params[index] === undefined
      ? fallback
      : params[index]
  // Movement distance: missing or 0 means 1
  const distance = (): number => param(0, 1) || 1

  if (isPrivate) {
    switch (finalChar) {
      case 'B': // Block character: ESC[=9XXB
        if (params[0] >= 900 && params[0] <= 999) {
          drawBlock(params[0] - 900)
        }
        break
      case 'F': // Text color
        attr.textColor = param(0, 15)
        break
      case 'G': // Background color
        attr.backgroundColor = param(0, 1)
        break
    }
    return
  }

  switch (finalChar) {
    case 'm': // Select graphic rendition
      applySgr(parts)
      break

    case 'H': // Cursor position (row;col, 1-based)
    case 'f':
      cursor.y = Number.isNaN(params[0]) ? 0 : params[0] - 1
      cursor.x =
        parts.length >= 2 && !Number.isNaN(params[1]) ? params[1] - 1 : 0
      break

    case 'A': // Cursor up
      cursor.y -= distance()
      if (cursor.y < 0) {
        cursor.y = 0
        cursor.x = 0
      }
      break

    case 'B': // Cursor down
      cursor.y += distance()
      if (cursor.y >= SCREEN_HEIGHT) {
        cursor.y = SCREEN_HEIGHT - 1
      }
      break

    case 'C': // Cursor right
      cursor.x += distance()
      break

    case 'D': // Cursor left
      cursor.x -= distance()
      if (cursor.x < 0) {
        cursor.x = 0
      }
      break

    case 'E': // Cursor next line
      cursor.y += distance()
      cursor.x = 0
      if (cursor.y >= SCREEN_HEIGHT) {
        cursor.y = SCREEN_HEIGHT - 1
      }
      break

    case 'F': // Cursor previous line
      cursor.y -= distance()
      cursor.x = 0
      if (cursor.y < 0) {
        cursor.y = 0
      }
      break

    case 's': // Store cursor position and colors
      if (paramStr === '') {
        terminalState.cursorStore = {
          x: cursor.x,
          y: cursor.y,
          textColor: attr.textColor,
          backgroundColor: attr.backgroundColor
        }
      }
      break

    case 'u': // Restore cursor position and colors
      if (paramStr === '') {
        cursor.x = cursorStore.x
        cursor.y = cursorStore.y
        if (cursorStore.textColor !== undefined) {
          attr.textColor = cursorStore.textColor
        }
        if (cursorStore.backgroundColor !== undefined) {
          attr.backgroundColor = cursorStore.backgroundColor
        }
      }
      break

    case 'J': // Clear screen
      clearScreen(param(0, 0), terminalRef, recordHistory)
      break

    case 'K': // Clear line
      clearLine(param(0, 0), terminalRef)
      break

    case 'r': // Set scroll region (top;bottom, 1-based)
      if (parts.length >= 2) {
        const scrollFrom = Number.isNaN(params[0]) ? 0 : params[0] - 1
        const scrollTo = Number.isNaN(params[1]) ? 0 : params[1] - 1

        if (scrollFrom <= 0 && scrollTo <= 0) {
          terminalState.windowTop = 0
          terminalState.windowBottom = SCREEN_HEIGHT - 1
        } else {
          terminalState.windowTop = scrollFrom
          terminalState.windowBottom = scrollTo
        }
      }
      break
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
