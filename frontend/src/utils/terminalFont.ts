import {
  BOX_DRAWING_FONT,
  DEFAULT_FONT
} from '../constants/terminalConfig'

const BOX_DRAWING_START = 0x2500
const BOX_DRAWING_END = 0x257f

export const isBoxDrawingChar = (ch: string): boolean => {
  const code = ch.codePointAt(0)

  return (
    code !== undefined &&
    code >= BOX_DRAWING_START &&
    code <= BOX_DRAWING_END
  )
}

export const getTerminalFontForChar = (ch: string): string =>
  isBoxDrawingChar(ch) ? BOX_DRAWING_FONT : DEFAULT_FONT

export const getTerminalCanvasFont = (fontFamily: string): string =>
  `normal 16px '${fontFamily}'`
