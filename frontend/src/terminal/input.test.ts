import {
  getTerminalKeySequence,
  normalizePastedText,
  type TerminalKeyEvent
} from './input'

const keyEvent = (
  key: string,
  overrides: Partial<TerminalKeyEvent> = {}
): TerminalKeyEvent => ({
  key,
  code: '',
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  isComposing: false,
  altGraphKey: false,
  ...overrides
})

test('leaves printable text to the browser input and IME path', () => {
  expect(getTerminalKeySequence(keyEvent('a'), false)).toBeNull()
  expect(getTerminalKeySequence(keyEvent('한'), false)).toBeNull()
  expect(
    getTerminalKeySequence(
      keyEvent('Process', { isComposing: true }),
      false
    )
  ).toBeNull()
})

test('maps editing and navigation keys to terminal sequences', () => {
  expect(getTerminalKeySequence(keyEvent('Enter'), false)).toBe('\r')
  expect(getTerminalKeySequence(keyEvent('Backspace'), false)).toBe('\b')
  expect(getTerminalKeySequence(keyEvent('Tab'), false)).toBe('\t')
  expect(
    getTerminalKeySequence(keyEvent('Tab', { shiftKey: true }), false)
  ).toBe('\x1b[Z')
  expect(getTerminalKeySequence(keyEvent('Delete'), false)).toBe('\x1b[3~')
  expect(getTerminalKeySequence(keyEvent('PageDown'), false)).toBe('\x1b[6~')
})

test('uses application cursor sequences when requested by the remote program', () => {
  expect(getTerminalKeySequence(keyEvent('ArrowUp'), false)).toBe('\x1b[A')
  expect(getTerminalKeySequence(keyEvent('ArrowUp'), true)).toBe('\x1bOA')
  expect(
    getTerminalKeySequence(
      keyEvent('ArrowUp', { ctrlKey: true }),
      true
    )
  ).toBe('\x1b[1;5A')
})

test('maps control and alt combinations while preserving browser clipboard keys', () => {
  expect(
    getTerminalKeySequence(keyEvent('c', { ctrlKey: true }), false)
  ).toBe('\x03')
  expect(
    getTerminalKeySequence(keyEvent('v', { ctrlKey: true }), false)
  ).toBe('\x16')
  expect(
    getTerminalKeySequence(
      keyEvent('V', { ctrlKey: true, shiftKey: true }),
      false
    )
  ).toBeNull()
  expect(
    getTerminalKeySequence(keyEvent('x', { altKey: true }), false)
  ).toBe('\x1bx')
})

test('does not consume AltGraph or platform shortcuts', () => {
  expect(
    getTerminalKeySequence(
      keyEvent('@', {
        ctrlKey: true,
        altKey: true,
        altGraphKey: true
      }),
      false
    )
  ).toBeNull()
  expect(
    getTerminalKeySequence(keyEvent('c', { metaKey: true }), false)
  ).toBeNull()
})

test('normalizes pasted line breaks to terminal carriage returns', () => {
  expect(normalizePastedText('one\r\ntwo\nthree')).toBe(
    'one\rtwo\rthree'
  )
})
