import { describe, expect, test } from 'bun:test'
import { preprocessBlockChars } from './telnet'

const ESC = '\x1b'

describe('preprocessBlockChars', () => {
  test('replaces full block (0xADFC) with ESC[=901B', () => {
    const input = Buffer.from([0xAD, 0xFC])
    expect(preprocessBlockChars(input).toString('latin1')).toBe(`${ESC}[=901B`)
  })

  test('replaces lower half block (0xADFD) with ESC[=903B', () => {
    const input = Buffer.from([0xAD, 0xFD])
    expect(preprocessBlockChars(input).toString('latin1')).toBe(`${ESC}[=903B`)
  })

  test('replaces upper half block (0xAEA2) with ESC[=902B', () => {
    const input = Buffer.from([0xAE, 0xA2])
    expect(preprocessBlockChars(input).toString('latin1')).toBe(`${ESC}[=902B`)
  })

  test('passes plain ASCII through unchanged', () => {
    const input = Buffer.from('hello, world\r\n', 'ascii')
    expect(preprocessBlockChars(input).equals(input)).toBe(true)
  })

  test('passes normal EUC-KR bytes through unchanged', () => {
    // '한글' in EUC-KR: C7 D1 B1 DB
    const input = Buffer.from([0xC7, 0xD1, 0xB1, 0xDB])
    expect(preprocessBlockChars(input).equals(input)).toBe(true)
  })

  test('replaces blocks embedded in surrounding text', () => {
    const input = Buffer.concat([
      Buffer.from('a', 'ascii'),
      Buffer.from([0xAD, 0xFC]),
      Buffer.from('b', 'ascii')
    ])
    expect(preprocessBlockChars(input).toString('latin1')).toBe(
      `a${ESC}[=901Bb`
    )
  })

  test('keeps a trailing lone first byte untouched', () => {
    const input = Buffer.from([0x41, 0xAD])
    expect(preprocessBlockChars(input).equals(input)).toBe(true)
  })
})
