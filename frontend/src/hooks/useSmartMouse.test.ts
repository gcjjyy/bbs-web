import { stripAnsiColorCodes } from './useSmartMouse'

test('stripAnsiColorCodes removes BBS color escape sequences', () => {
  expect(stripAnsiColorCodes('\x1b[=15F12. 게시판\x1b[=1G')).toBe('12. 게시판')
})
