import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  renderTerminalInputOverlay,
  setTerminalComposition,
  setupTerminalInputOverlay
} from './inputOverlay'
import { resetTerminalState, terminalState } from './state'

const ctx = {
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  fillStyle: '',
  font: '',
  textBaseline: 'top'
}

const canvas = {
  width: 640,
  height: 528,
  getContext: vi.fn(() => ctx)
} as unknown as HTMLCanvasElement

beforeEach(() => {
  resetTerminalState()
  terminalState.COLOR = Array.from({ length: 16 }, (_, index) => String(index))
  terminalState.cursor = { x: 3, y: 2 }
  setupTerminalInputOverlay(canvas)
  vi.clearAllMocks()
})

afterEach(() => {
  setupTerminalInputOverlay(null)
})

test('draws a visible cursor at the terminal position', () => {
  renderTerminalInputOverlay()

  expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 640, 528)
  expect(ctx.fillRect).toHaveBeenCalledWith(24, 32, 2, 16)
})

test('draws the active Korean composition and advances its cursor', () => {
  setTerminalComposition('한')

  expect(ctx.fillRect).toHaveBeenCalledWith(24, 32, 16, 16)
  expect(ctx.fillText).toHaveBeenCalledWith('한', 24, 32)
  expect(ctx.fillRect).toHaveBeenCalledWith(24, 47, 16, 1)
  expect(ctx.fillRect).toHaveBeenCalledWith(40, 32, 2, 16)
})

test('wraps a wide composition preview at the right margin', () => {
  terminalState.cursor = { x: 79, y: 1 }

  setTerminalComposition('한')

  expect(ctx.fillText).toHaveBeenCalledWith('한', 0, 32)
  expect(ctx.fillRect).toHaveBeenCalledWith(16, 32, 2, 16)
})
