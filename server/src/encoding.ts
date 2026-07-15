import * as iconv from 'iconv-lite'

/**
 * Encode a filename to CP949 for ZMODEM transfers to the BBS.
 * macOS uses NFD (decomposed) for filenames, but CP949 needs NFC (composed).
 */
export function encodeFilenameToCp949(filename: string): Buffer {
  const normalized = filename.normalize('NFC')
  return iconv.encode(normalized, 'cp949')
}
