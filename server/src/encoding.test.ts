import { describe, expect, test } from 'bun:test'
import * as iconv from 'iconv-lite'
import { encodeFilenameToCp949 } from './encoding'

describe('encodeFilenameToCp949', () => {
  test('encodes an ASCII filename unchanged', () => {
    const encoded = encodeFilenameToCp949('readme.txt')
    expect(Array.from(encoded)).toEqual(
      Array.from(Buffer.from('readme.txt', 'ascii'))
    )
  })

  test('encodes a Korean filename to CP949', () => {
    const encoded = encodeFilenameToCp949('한글.txt')
    expect(iconv.decode(Buffer.from(encoded), 'cp949')).toBe('한글.txt')
  })

  test('normalizes NFD (macOS) filenames to NFC before encoding', () => {
    // '한글.txt' decomposed into NFD as macOS filesystems store it
    const nfdName = '한글.txt'.normalize('NFD')
    const encoded = encodeFilenameToCp949(nfdName)
    expect(iconv.decode(Buffer.from(encoded), 'cp949')).toBe('한글.txt')
  })
})
