import { vi } from 'vitest'
import { write, replayTerminalHistory } from './emulation'
import {
  MAX_TERMINAL_HISTORY_CHARS,
  resetTerminalState,
  terminalState
} from './state'

const terminalRef = {
  current: {
    width: 640,
    height: 528,
    clientWidth: 320,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640 })
  } as HTMLCanvasElement
}

const smartMouseBoxRef = {
  current: {
    style: {}
  } as HTMLDivElement
}

const commandRef = {
  current: {
    style: {}
  } as HTMLInputElement
}

const createContext = () =>
  ({
    fillStyle: '',
    fillRect: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
    getImageData: vi.fn(() => ({})),
    putImageData: vi.fn(),
    drawImage: vi.fn(),
    canvas: terminalRef.current
  }) as unknown as CanvasRenderingContext2D

beforeEach(() => {
  resetTerminalState()
  terminalState.ctx2d = createContext()
  terminalState.COLOR = Array.from({ length: 16 }, (_, index) => String(index))
})

test('replaying terminal history redraws without appending duplicate history', () => {
  write('hello', terminalRef, smartMouseBoxRef, commandRef)

  replayTerminalHistory(terminalRef, smartMouseBoxRef, commandRef)

  expect(terminalState.lastPageText).toBe('hello')
  expect(terminalState.lastPageTextPos).toHaveLength(5)
})

test('tracks VT100 application cursor mode', () => {
  write('\x1b[?1h', terminalRef, smartMouseBoxRef, commandRef)
  expect(terminalState.applicationCursorKeys).toBe(true)

  write('\x1b[?1l', terminalRef, smartMouseBoxRef, commandRef)
  expect(terminalState.applicationCursorKeys).toBe(false)
})

test('consumes VT100 keypad mode without swallowing following text', () => {
  write('\x1b=hello', terminalRef, smartMouseBoxRef, commandRef)

  expect(terminalState.escape).toBeNull()
  expect(terminalState.lastPageText).toContain('hello')
  expect(terminalState.cursor.x).toBe(5)
})

test('applies the echoed backspace-space-backspace erase sequence', () => {
  const ctx = terminalState.ctx2d as CanvasRenderingContext2D

  write('abc\b \b', terminalRef, smartMouseBoxRef, commandRef)

  expect(terminalState.cursor).toEqual({ x: 2, y: 0 })
  expect(ctx.fillRect).toHaveBeenCalledWith(16, 0, 8, 16)
})

test('wraps printable text at the 80-column margin', () => {
  write('x'.repeat(80), terminalRef, smartMouseBoxRef, commandRef)
  expect(terminalState.cursor).toEqual({ x: 79, y: 0 })
  expect(terminalState.wrapPending).toBe(true)

  write('y', terminalRef, smartMouseBoxRef, commandRef)

  expect(terminalState.cursor).toEqual({ x: 1, y: 1 })
  expect(terminalState.lastPageTextPos.at(-1)).toEqual({ x: 0, y: 1 })
})

test('moves a wide character to the next line when it cannot fit', () => {
  write(`${'x'.repeat(79)}한`, terminalRef, smartMouseBoxRef, commandRef)

  expect(terminalState.cursor).toEqual({ x: 2, y: 1 })
  expect(terminalState.lastPageTextPos.at(-1)).toEqual({ x: 0, y: 1 })
})

test('respects the VT100 automatic wrap mode', () => {
  write('\x1b[?7l', terminalRef, smartMouseBoxRef, commandRef)
  write('x'.repeat(81), terminalRef, smartMouseBoxRef, commandRef)

  expect(terminalState.autoWrapMode).toBe(false)
  expect(terminalState.wrapPending).toBe(false)
  expect(terminalState.cursor).toEqual({ x: 79, y: 0 })

  write('\x1b[?7h', terminalRef, smartMouseBoxRef, commandRef)
  write('yz', terminalRef, smartMouseBoxRef, commandRef)

  expect(terminalState.autoWrapMode).toBe(true)
  expect(terminalState.cursor).toEqual({ x: 1, y: 1 })
})

test('terminal history keeps text and positions trimmed together', () => {
  const text = 'x'.repeat(MAX_TERMINAL_HISTORY_CHARS + 50)

  write(text, terminalRef, smartMouseBoxRef, commandRef)

  expect(terminalState.lastPageText).toHaveLength(MAX_TERMINAL_HISTORY_CHARS)
  expect(terminalState.lastPageText).toBe('x'.repeat(MAX_TERMINAL_HISTORY_CHARS))
  expect(terminalState.lastPageTextPos).toHaveLength(
    terminalState.lastPageText.length
  )
})

test('scrolling copies the canvas with drawImage instead of pixel readback', () => {
  const ctx = terminalState.ctx2d as CanvasRenderingContext2D

  // 33 lines tall; one extra line feed forces a scroll
  write('\n'.repeat(33), terminalRef, smartMouseBoxRef, commandRef)

  expect(ctx.drawImage).toHaveBeenCalledWith(
    terminalRef.current,
    0, 16, 640, 512,
    0, 0, 640, 512
  )
  expect(ctx.getImageData).not.toHaveBeenCalled()
  expect(ctx.putImageData).not.toHaveBeenCalled()
})

test('smart mouse rebuild is debounced until output settles', () => {
  vi.useFakeTimers()
  try {
    write('12. 게시판', terminalRef, smartMouseBoxRef, commandRef)
    write(' 이동', terminalRef, smartMouseBoxRef, commandRef)

    // Not rebuilt synchronously during rapid output
    expect(terminalState.smartMouse).toHaveLength(0)

    vi.runAllTimers()

    expect(terminalState.smartMouse.length).toBeGreaterThan(0)
    expect(terminalState.smartMouse[0].command).toBe('12')
  } finally {
    vi.useRealTimers()
  }
})

describe('escape sequence parsing', () => {
  test('SGR sets colors, reverse video, and resets', () => {
    write('\x1b[31;44m', terminalRef, smartMouseBoxRef, commandRef)
    expect(terminalState.attr.textColor).toBe(4)
    expect(terminalState.attr.backgroundColor).toBe(1)

    write('\x1b[7m', terminalRef, smartMouseBoxRef, commandRef)
    expect(terminalState.attr.reversed).toBe(true)

    write('\x1b[27m', terminalRef, smartMouseBoxRef, commandRef)
    expect(terminalState.attr.reversed).toBe(false)

    write('\x1b[0m', terminalRef, smartMouseBoxRef, commandRef)
    expect(terminalState.attr).toEqual({
      textColor: 15,
      backgroundColor: 1,
      reversed: false
    })
  })

  test('SGR bright colors map to the upper palette', () => {
    write('\x1b[91;104m', terminalRef, smartMouseBoxRef, commandRef)
    expect(terminalState.attr.textColor).toBe(12)
    expect(terminalState.attr.backgroundColor).toBe(9)
  })

  test('private color codes set palette indices directly', () => {
    write('\x1b[=14F\x1b[=5G', terminalRef, smartMouseBoxRef, commandRef)
    expect(terminalState.attr.textColor).toBe(14)
    expect(terminalState.attr.backgroundColor).toBe(5)
  })

  test('cursor positioning with row and column', () => {
    write('\x1b[5;10H', terminalRef, smartMouseBoxRef, commandRef)
    expect(terminalState.cursor).toEqual({ x: 9, y: 4 })

    write('\x1b[3H', terminalRef, smartMouseBoxRef, commandRef)
    expect(terminalState.cursor).toEqual({ x: 0, y: 2 })

    write('\x1b[7;2f', terminalRef, smartMouseBoxRef, commandRef)
    expect(terminalState.cursor).toEqual({ x: 1, y: 6 })
  })

  test('relative cursor movement clamps at screen edges', () => {
    write('\x1b[10;10H', terminalRef, smartMouseBoxRef, commandRef)
    write('\x1b[3A\x1b[2C\x1b[1B\x1b[4D', terminalRef, smartMouseBoxRef, commandRef)
    expect(terminalState.cursor).toEqual({ x: 7, y: 7 })

    // Moving up past the top resets both axes (historical quirk)
    write('\x1b[99A', terminalRef, smartMouseBoxRef, commandRef)
    expect(terminalState.cursor).toEqual({ x: 0, y: 0 })

    // Moving down past the bottom clamps
    write('\x1b[99B', terminalRef, smartMouseBoxRef, commandRef)
    expect(terminalState.cursor.y).toBe(32)

    // Left past the edge clamps to zero
    write('\x1b[99D', terminalRef, smartMouseBoxRef, commandRef)
    expect(terminalState.cursor.x).toBe(0)
  })

  test('cursor next/previous line move to column zero', () => {
    write('\x1b[10;10H\x1b[2E', terminalRef, smartMouseBoxRef, commandRef)
    expect(terminalState.cursor).toEqual({ x: 0, y: 11 })

    write('\x1b[10;10H\x1b[3F', terminalRef, smartMouseBoxRef, commandRef)
    expect(terminalState.cursor).toEqual({ x: 0, y: 6 })
  })

  test('save and restore cursor with colors', () => {
    write('\x1b[=10F\x1b[=2G\x1b[5;5H\x1b[s', terminalRef, smartMouseBoxRef, commandRef)
    write('\x1b[1;1H\x1b[=15F\x1b[=1G', terminalRef, smartMouseBoxRef, commandRef)
    write('\x1b[u', terminalRef, smartMouseBoxRef, commandRef)

    expect(terminalState.cursor).toEqual({ x: 4, y: 4 })
    expect(terminalState.attr.textColor).toBe(10)
    expect(terminalState.attr.backgroundColor).toBe(2)
  })

  test('clear screen homes the cursor and anchors history', () => {
    write('hello\x1b[2J', terminalRef, smartMouseBoxRef, commandRef)
    expect(terminalState.cursor).toEqual({ x: 0, y: 0 })
    expect(terminalState.lastPageText).toBe('\x1b[2J')
  })

  test('block escape draws a two column block and advances the cursor', () => {
    const ctx = terminalState.ctx2d as CanvasRenderingContext2D

    write('\x1b[=901B', terminalRef, smartMouseBoxRef, commandRef)
    expect(terminalState.cursor.x).toBe(2)
    // Background fill + full block fill at the origin
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 16, 16)

    write('\x1b[=902B', terminalRef, smartMouseBoxRef, commandRef)
    expect(terminalState.cursor.x).toBe(4)
    // Upper half block at the advanced cursor position
    expect(ctx.fillRect).toHaveBeenCalledWith(16, 0, 16, 8)
  })

  test('scroll region is stored and reset', () => {
    write('\x1b[5;20r', terminalRef, smartMouseBoxRef, commandRef)
    expect(terminalState.windowTop).toBe(4)
    expect(terminalState.windowBottom).toBe(19)

    write('\x1b[0;0r', terminalRef, smartMouseBoxRef, commandRef)
    expect(terminalState.windowTop).toBe(0)
    expect(terminalState.windowBottom).toBe(32)
  })

  test('unknown SGR codes reset attributes (historical behavior)', () => {
    write('\x1b[=10F\x1b[63m', terminalRef, smartMouseBoxRef, commandRef)
    expect(terminalState.attr).toEqual({
      textColor: 15,
      backgroundColor: 1,
      reversed: false
    })
  })
})

test('clear line uses the intrinsic canvas width for drawing coordinates', () => {
  const ctx = terminalState.ctx2d as CanvasRenderingContext2D

  write('\x1b[2K', terminalRef, smartMouseBoxRef, commandRef)

  expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 640, 16)
})
