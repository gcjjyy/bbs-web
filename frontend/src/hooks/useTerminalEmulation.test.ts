import { write, replayTerminalHistory } from './useTerminalEmulation'
import {
  MAX_TERMINAL_HISTORY_CHARS,
  resetTerminalState,
  terminalState
} from './useTerminalState'

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
    fillRect: jest.fn(),
    fillText: jest.fn(),
    measureText: jest.fn((text: string) => ({ width: text.length * 8 })),
    getImageData: jest.fn(() => ({})),
    putImageData: jest.fn(),
    drawImage: jest.fn(),
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
  jest.useFakeTimers()
  try {
    write('12. 게시판', terminalRef, smartMouseBoxRef, commandRef)
    write(' 이동', terminalRef, smartMouseBoxRef, commandRef)

    // Not rebuilt synchronously during rapid output
    expect(terminalState.smartMouse).toHaveLength(0)

    jest.runAllTimers()

    expect(terminalState.smartMouse.length).toBeGreaterThan(0)
    expect(terminalState.smartMouse[0].command).toBe('12')
  } finally {
    jest.useRealTimers()
  }
})

test('clear line uses the intrinsic canvas width for drawing coordinates', () => {
  const ctx = terminalState.ctx2d as CanvasRenderingContext2D

  write('\x1b[2K', terminalRef, smartMouseBoxRef, commandRef)

  expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 640, 16)
})
