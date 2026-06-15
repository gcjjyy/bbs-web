import {
  BOX_DRAWING_FONT,
  DEFAULT_FONT
} from '../constants/terminalConfig'
import {
  getTerminalCanvasFont,
  getTerminalFontForChar,
  isBoxDrawingChar
} from './terminalFont'

test('uses the fallback font only for Unicode box drawing characters', () => {
  expect(isBoxDrawingChar('─')).toBe(true)
  expect(isBoxDrawingChar('╿')).toBe(true)
  expect(isBoxDrawingChar('▀')).toBe(false)
  expect(isBoxDrawingChar('■')).toBe(false)
  expect(isBoxDrawingChar('가')).toBe(false)

  expect(getTerminalFontForChar('─')).toBe(BOX_DRAWING_FONT)
  expect(getTerminalFontForChar('╬')).toBe(BOX_DRAWING_FONT)
  expect(getTerminalFontForChar('■')).toBe(DEFAULT_FONT)
  expect(getTerminalFontForChar('가')).toBe(DEFAULT_FONT)
})

test('formats canvas font declarations consistently', () => {
  expect(getTerminalCanvasFont(DEFAULT_FONT)).toBe(
    `normal 16px '${DEFAULT_FONT}'`
  )
  expect(getTerminalCanvasFont(BOX_DRAWING_FONT)).toBe(
    `normal 16px '${BOX_DRAWING_FONT}'`
  )
})
