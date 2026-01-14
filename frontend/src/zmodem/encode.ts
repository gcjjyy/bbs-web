/**
 * ZMODEM Frame Encoding
 * Creates headers and data packets
 */

import {
  ZPAD, ZDLE, ZBIN, ZHEX, ZBIN32,
  ZCRCE, ZCRCG, ZCRCQ, ZCRCW,
  XON, XOFF, DLE, CR, CAN
} from './constants'
import { crc16, crc16Finish, crc32, crc32Finish, crc16Update, crc32Update } from './crc'

// Characters that need to be escaped
const ESCAPE_CHARS = new Set([
  ZDLE,        // Must escape
  XON,         // 0x11
  XOFF,        // 0x13
  XON | 0x80,  // 0x91
  XOFF | 0x80, // 0x93
  DLE,         // 0x10
  DLE | 0x80   // 0x90
])

/**
 * Check if a byte needs escaping
 */
function needsEscape(byte: number): boolean {
  return ESCAPE_CHARS.has(byte) || (byte & 0x60) === 0
}

/**
 * Escape a single byte if needed
 */
function escapeByte(byte: number, output: number[]): void {
  if (needsEscape(byte)) {
    output.push(ZDLE)
    output.push(byte ^ 0x40)
  } else {
    output.push(byte)
  }
}

/**
 * Convert byte to two hex characters
 */
function toHex(byte: number): [number, number] {
  const hex = byte.toString(16).padStart(2, '0')
  return [hex.charCodeAt(0), hex.charCodeAt(1)]
}

/**
 * Encode a HEX header
 * Format: ZPAD ZPAD ZDLE ZHEX type[2] p0[2] p1[2] p2[2] p3[2] crc[4] CR LF [XON]
 */
export function encodeHexHeader(type: number, position: number = 0): Uint8Array {
  const output: number[] = []

  // Header prefix
  output.push(ZPAD, ZPAD, ZDLE, ZHEX)

  // Type as hex
  const [t1, t2] = toHex(type)
  output.push(t1, t2)

  // Position as 4 bytes (little endian), each as hex
  const p0 = position & 0xff
  const p1 = (position >> 8) & 0xff
  const p2 = (position >> 16) & 0xff
  const p3 = (position >> 24) & 0xff

  output.push(...toHex(p0))
  output.push(...toHex(p1))
  output.push(...toHex(p2))
  output.push(...toHex(p3))

  // Calculate CRC16 over type and position bytes
  const headerBytes = new Uint8Array([type, p0, p1, p2, p3])
  const crc = crc16(headerBytes)

  // CRC as hex (high byte first)
  output.push(...toHex((crc >> 8) & 0xff))
  output.push(...toHex(crc & 0xff))

  // Terminator
  output.push(CR, 0x8a) // CR LF with high bit set

  // XON if not ZFIN or ZACK
  if (type !== 8 && type !== 3) { // ZFIN=8, ZACK=3
    output.push(XON)
  }

  return new Uint8Array(output)
}

/**
 * Encode a binary header with CRC16
 * Format: ZPAD ZDLE ZBIN type p0 p1 p2 p3 crc[2]
 */
export function encodeBinaryHeader16(type: number, position: number = 0): Uint8Array {
  const output: number[] = []

  // Header prefix (only ONE ZPAD for binary headers!)
  output.push(ZPAD, ZDLE, ZBIN)

  // Type (escaped if needed)
  escapeByte(type, output)

  // Position as 4 bytes (little endian)
  const p0 = position & 0xff
  const p1 = (position >> 8) & 0xff
  const p2 = (position >> 16) & 0xff
  const p3 = (position >> 24) & 0xff

  escapeByte(p0, output)
  escapeByte(p1, output)
  escapeByte(p2, output)
  escapeByte(p3, output)

  // Calculate CRC16
  // Note: Binary headers do NOT use crc16Finish (no trailing zeros)
  const headerBytes = new Uint8Array([type, p0, p1, p2, p3])
  const crc = crc16(headerBytes)

  // CRC (escaped, high byte first)
  escapeByte((crc >> 8) & 0xff, output)
  escapeByte(crc & 0xff, output)

  return new Uint8Array(output)
}

/**
 * Encode a binary header with CRC32
 * Format: ZPAD ZDLE ZBIN32 type p0 p1 p2 p3 crc[4]
 */
export function encodeBinaryHeader32(type: number, position: number = 0): Uint8Array {
  const output: number[] = []

  // Header prefix (only ONE ZPAD for binary headers!)
  output.push(ZPAD, ZDLE, ZBIN32)

  // Type (escaped if needed)
  escapeByte(type, output)

  // Position as 4 bytes (little endian)
  const p0 = position & 0xff
  const p1 = (position >> 8) & 0xff
  const p2 = (position >> 16) & 0xff
  const p3 = (position >> 24) & 0xff

  escapeByte(p0, output)
  escapeByte(p1, output)
  escapeByte(p2, output)
  escapeByte(p3, output)

  // Calculate CRC32
  const headerBytes = new Uint8Array([type, p0, p1, p2, p3])
  let crc = crc32(headerBytes)
  crc = crc32Finish(crc)

  // CRC (escaped, little endian)
  escapeByte(crc & 0xff, output)
  escapeByte((crc >> 8) & 0xff, output)
  escapeByte((crc >> 16) & 0xff, output)
  escapeByte((crc >> 24) & 0xff, output)

  return new Uint8Array(output)
}

/**
 * Encode a binary header with flags
 */
export function encodeBinaryHeaderWithFlags(
  type: number,
  flags: Uint8Array,
  useCrc32: boolean = false
): Uint8Array {
  const output: number[] = []

  // Header prefix (only ONE ZPAD for binary headers!)
  output.push(ZPAD, ZDLE, useCrc32 ? ZBIN32 : ZBIN)

  // Type (escaped if needed)
  escapeByte(type, output)

  // Flags (ZF3, ZF2, ZF1, ZF0) = (p3, p2, p1, p0)
  for (let i = 0; i < 4; i++) {
    escapeByte(flags[i] || 0, output)
  }

  // Calculate CRC
  const headerBytes = new Uint8Array([type, flags[0] || 0, flags[1] || 0, flags[2] || 0, flags[3] || 0])

  if (useCrc32) {
    let crc = crc32(headerBytes)
    crc = crc32Finish(crc)
    escapeByte(crc & 0xff, output)
    escapeByte((crc >> 8) & 0xff, output)
    escapeByte((crc >> 16) & 0xff, output)
    escapeByte((crc >> 24) & 0xff, output)
  } else {
    // Note: Binary CRC16 headers do NOT use crc16Finish
    const crc = crc16(headerBytes)
    escapeByte((crc >> 8) & 0xff, output)
    escapeByte(crc & 0xff, output)
  }

  return new Uint8Array(output)
}

/**
 * Encode data subpacket with CRC16
 */
export function encodeDataSubpacket16(
  data: Uint8Array,
  frameEnd: number = ZCRCG
): Uint8Array {
  const output: number[] = []

  // Calculate CRC including data and frame end byte
  let crc = crc16(data)
  crc = crc16Update(crc, frameEnd)
  crc = crc16Finish(crc)

  // Data bytes (escaped)
  for (let i = 0; i < data.length; i++) {
    escapeByte(data[i], output)
  }

  // Frame end indicator
  output.push(ZDLE)
  output.push(frameEnd)

  // CRC (high byte first)
  escapeByte((crc >> 8) & 0xff, output)
  escapeByte(crc & 0xff, output)

  return new Uint8Array(output)
}

/**
 * Encode data subpacket with CRC32
 */
export function encodeDataSubpacket32(
  data: Uint8Array,
  frameEnd: number = ZCRCG
): Uint8Array {
  const output: number[] = []

  // Calculate CRC including data and frame end byte
  let crc = crc32(data)
  crc = crc32Update(crc, frameEnd)
  crc = crc32Finish(crc)

  // Data bytes (escaped)
  for (let i = 0; i < data.length; i++) {
    escapeByte(data[i], output)
  }

  // Frame end indicator
  output.push(ZDLE)
  output.push(frameEnd)

  // CRC (little endian)
  escapeByte(crc & 0xff, output)
  escapeByte((crc >> 8) & 0xff, output)
  escapeByte((crc >> 16) & 0xff, output)
  escapeByte((crc >> 24) & 0xff, output)

  return new Uint8Array(output)
}

/**
 * Encode cancel sequence (8 CAN + 8 BS)
 */
export function encodeCancelSequence(): Uint8Array {
  const output: number[] = []
  for (let i = 0; i < 8; i++) output.push(CAN)
  for (let i = 0; i < 8; i++) output.push(0x08) // Backspace
  return new Uint8Array(output)
}
