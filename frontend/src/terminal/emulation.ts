import {
  CANVAS_WIDTH,
  DEFAULT_FONT,
  FONT_WIDTH,
  FONT_HEIGHT,
  SCREEN_WIDTH,
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

const cellKey = (x: number, y: number): string => `${x},${y}`

const parseCellKey = (key: string): { x: number; y: number } => {
  const [x, y] = key.split(',').map(Number)
  return { x, y }
}

const findWideCharStart = (x: number, y: number): number | null => {
  if (terminalState.wideCharCells.has(cellKey(x, y))) return x
  if (x > 0 && terminalState.wideCharCells.has(cellKey(x - 1, y))) {
    return x - 1
  }
  return null
}

const removeWideCharsInRect = (
  startX: number,
  startY: number,
  endX: number,
  endY: number
): void => {
  for (const key of terminalState.wideCharCells) {
    const { x, y } = parseCellKey(key)
    if (
      y >= startY &&
      y <= endY &&
      x <= endX &&
      x + 1 >= startX
    ) {
      terminalState.wideCharCells.delete(key)
    }
  }
}

const clearOverlappingWideChars = (
  x: number,
  y: number,
  width: number,
  backgroundColor: string
): void => {
  const { ctx2d } = terminalState
  if (!ctx2d) return

  const starts = new Set<number>()
  for (let column = x; column < x + width; column++) {
    const start = findWideCharStart(column, y)
    if (start !== null) starts.add(start)
  }

  ctx2d.fillStyle = backgroundColor
  for (const start of starts) {
    ctx2d.fillRect(
      start * FONT_WIDTH,
      y * FONT_HEIGHT,
      2 * FONT_WIDTH,
      FONT_HEIGHT
    )
    terminalState.wideCharCells.delete(cellKey(start, y))
  }
}

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

  preparePrintable(2)

  const startX = cursor.x
  const x = startX * FONT_WIDTH
  const y = cursor.y * FONT_HEIGHT
  let textColor = COLOR[attr.textColor]
  let backgroundColor = COLOR[attr.backgroundColor]
  if (attr.reversed) {
    textColor = COLOR[attr.backgroundColor]
    backgroundColor = COLOR[attr.textColor]
  }

  clearOverlappingWideChars(startX, cursor.y, 2, backgroundColor)

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

  terminalState.wideCharCells.add(cellKey(startX, cursor.y))
  advanceAfterPrintable(2)
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
    terminalState.wrapPending = false
    terminalState.wideCharCells.clear()
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
    removeWideCharsInRect(
      cursor.x,
      cursor.y,
      SCREEN_WIDTH - 1,
      cursor.y
    )
    if (cursor.y < SCREEN_HEIGHT - 1) {
      removeWideCharsInRect(
        0,
        cursor.y + 1,
        SCREEN_WIDTH - 1,
        SCREEN_HEIGHT - 1
      )
    }
  } else if (mode === 1) {
    // Clear from beginning of screen to cursor
    if (cursor.y > 0) {
      ctx2d.fillRect(0, 0, terminalRef.current.width, cursor.y * FONT_HEIGHT)
    }
    ctx2d.fillRect(0, cursor.y * FONT_HEIGHT, (cursor.x + 1) * FONT_WIDTH, FONT_HEIGHT)
    if (cursor.y > 0) {
      removeWideCharsInRect(
        0,
        0,
        SCREEN_WIDTH - 1,
        cursor.y - 1
      )
    }
    removeWideCharsInRect(0, cursor.y, cursor.x, cursor.y)
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
    removeWideCharsInRect(0, cursor.y, SCREEN_WIDTH - 1, cursor.y)
  } else if (mode === 1) {
    // Beginning of line to cursor
    ctx2d.fillRect(0, cursor.y * FONT_HEIGHT, (cursor.x + 1) * FONT_WIDTH, FONT_HEIGHT)
    removeWideCharsInRect(0, cursor.y, cursor.x, cursor.y)
  } else if (mode === 0) {
    // Cursor to end of line
    ctx2d.fillRect(
      cursor.x * FONT_WIDTH,
      cursor.y * FONT_HEIGHT,
      terminalRef.current.width - cursor.x * FONT_WIDTH,
      FONT_HEIGHT
    )
    removeWideCharsInRect(
      cursor.x,
      cursor.y,
      SCREEN_WIDTH - 1,
      cursor.y
    )
  }
}

const applyEscape = (
  terminalRef: RefObject<HTMLCanvasElement | null>,
  recordHistory: boolean
): void => {
  const { ctx2d, cursor, cursorStore, attr, escape } = terminalState

  if (!ctx2d || !escape) return

  // VT100 keypad mode sequences are complete two-byte escapes. We do not
  // emulate the numeric keypad, but consuming them here keeps following text
  // from being mistaken for part of the escape sequence.
  if (escape === '\x1b=' || escape === '\x1b>') return

  // Only CSI sequences (ESC [ ... final-char) are handled
  if (escape.charAt(1) !== '[') return

  const finalChar = escape.charAt(escape.length - 1)
  let paramStr = escape.slice(2, -1)

  // '=' marks this project's private sequences (colors, block chars).
  // '?' marks standard DEC private modes.
  const isProjectPrivate = paramStr.startsWith('=')
  const isDecPrivate = paramStr.startsWith('?')
  if (isProjectPrivate || isDecPrivate) {
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

  if (isProjectPrivate) {
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

  if (isDecPrivate) {
    if (finalChar === 'h' || finalChar === 'l') {
      const enabled = finalChar === 'h'
      if (params.includes(1)) {
        terminalState.applicationCursorKeys = enabled
      }
      if (params.includes(7)) {
        terminalState.autoWrapMode = enabled
        if (!enabled) {
          terminalState.wrapPending = false
        }
      }
    }
    return
  }

  switch (finalChar) {
    case 'm': // Select graphic rendition
      applySgr(parts)
      break

    case 'H': // Cursor position (row;col, 1-based)
    case 'f':
      terminalState.wrapPending = false
      cursor.y = Number.isNaN(params[0]) ? 0 : params[0] - 1
      cursor.x =
        parts.length >= 2 && !Number.isNaN(params[1]) ? params[1] - 1 : 0
      break

    case 'A': // Cursor up
      terminalState.wrapPending = false
      cursor.y -= distance()
      if (cursor.y < 0) {
        cursor.y = 0
        cursor.x = 0
      }
      break

    case 'B': // Cursor down
      terminalState.wrapPending = false
      cursor.y += distance()
      if (cursor.y >= SCREEN_HEIGHT) {
        cursor.y = SCREEN_HEIGHT - 1
      }
      break

    case 'C': // Cursor right
      terminalState.wrapPending = false
      cursor.x += distance()
      break

    case 'D': // Cursor left
      terminalState.wrapPending = false
      cursor.x -= distance()
      if (cursor.x < 0) {
        cursor.x = 0
      }
      break

    case 'E': // Cursor next line
      terminalState.wrapPending = false
      cursor.y += distance()
      cursor.x = 0
      if (cursor.y >= SCREEN_HEIGHT) {
        cursor.y = SCREEN_HEIGHT - 1
      }
      break

    case 'F': // Cursor previous line
      terminalState.wrapPending = false
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
  if (
    terminalState.escape === '\x1b=' ||
    terminalState.escape === '\x1b>'
  ) {
    return true
  }
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

  const shiftedWideChars = new Set<string>()
  for (const key of terminalState.wideCharCells) {
    const { x, y } = parseCellKey(key)
    if (y >= windowTop && y <= windowBottom) {
      if (y > windowTop) shiftedWideChars.add(cellKey(x, y - 1))
    } else {
      shiftedWideChars.add(key)
    }
  }
  terminalState.wideCharCells = shiftedWideChars
}

const cr = (): void => {
  terminalState.cursor.x = 0
  terminalState.wrapPending = false
}

const lf = (): void => {
  terminalState.wrapPending = false
  if (++terminalState.cursor.y > terminalState.windowBottom) {
    terminalState.cursor.y = terminalState.windowBottom
    screenScrollUp()
  }
}

const backspace = (): void => {
  const { cursor } = terminalState

  if (terminalState.wrapPending) {
    terminalState.wrapPending = false
    const wideStart = findWideCharStart(cursor.x, cursor.y)
    if (wideStart !== null && wideStart < cursor.x) {
      cursor.x = wideStart
    }
  } else if (cursor.x > 0) {
    const wideStart = findWideCharStart(cursor.x - 1, cursor.y)
    cursor.x = wideStart ?? cursor.x - 1
  }
}

const horizontalTab = (): void => {
  terminalState.wrapPending = false
  const nextTabStop = (Math.floor(terminalState.cursor.x / 8) + 1) * 8
  terminalState.cursor.x = Math.min(nextTabStop, SCREEN_WIDTH - 1)
}

const preparePrintable = (charWidth: number): void => {
  const { cursor, autoWrapMode, wrapPending } = terminalState

  if (!wrapPending && cursor.x + charWidth <= SCREEN_WIDTH) return

  if (autoWrapMode) {
    cursor.x = 0
    lf()
  } else {
    cursor.x = Math.max(0, SCREEN_WIDTH - charWidth)
    terminalState.wrapPending = false
  }
}

const advanceAfterPrintable = (charWidth: number): void => {
  const nextX = terminalState.cursor.x + charWidth
  if (nextX >= SCREEN_WIDTH) {
    terminalState.cursor.x = SCREEN_WIDTH - 1
    terminalState.wrapPending = terminalState.autoWrapMode
  } else {
    terminalState.cursor.x = nextX
    terminalState.wrapPending = false
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
    const charCode = ch.charCodeAt(0)
    const isPrintable =
      !terminalState.escape &&
      charCode >= 32 &&
      charCode !== 127 &&
      charCode !== 65533
    const charWidth = charCode < 0x80 ? 1 : 2

    if (isPrintable) {
      preparePrintable(charWidth)
    }

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
      switch (charCode) {
        case 27:
          terminalState.escape = '\x1b'
          break

        case 13:
          cr()
          break

        case 10:
          lf()
          break

        case 8:
          backspace()
          break

        case 9:
          horizontalTab()
          break

        case 0: // NULL
        case 7: // Bell
        case 24: // ZDLE
        case 17: // XON
        case 127: // Delete
        case 138: // LF (ZMODEM)
        case 65533: // Unknown
          break

        default:
          {
            if (charCode < 32) break

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

            clearOverlappingWideChars(
              cursor.x,
              cursor.y,
              charWidth,
              backgroundColor
            )

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

            if (charWidth === 2) {
              terminalState.wideCharCells.add(
                cellKey(cursor.x, cursor.y)
              )
            }

            advanceAfterPrintable(charWidth)
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
  terminalState.applicationCursorKeys = false
  terminalState.autoWrapMode = true
  terminalState.wrapPending = false
  terminalState.wideCharCells.clear()
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
