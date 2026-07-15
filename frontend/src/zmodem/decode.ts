/**
 * ZMODEM Frame Decoding / Parser
 * Streaming parser for ZMODEM frames
 */

import {
  ZPAD, ZDLE, ZBIN, ZHEX, ZBIN32,
  ZCRCE, ZCRCG, ZCRCQ, ZCRCW,
  ZRUB0, ZRUB1,
  FRAME_NAMES
} from './constants'
import { crc16, crc16Finish, crc32, crc32Finish, crc16Update, crc32Update } from './crc'

// Parser states
enum ParserState {
  IDLE,
  GOT_ZPAD,
  GOT_ZPAD2,
  GOT_ZDLE,
  IN_HEX_HEADER,
  IN_BIN16_HEADER,
  IN_BIN32_HEADER,
  IN_DATA,
  IN_DATA_CRC  // Collecting CRC bytes after frame end marker
}

export interface ZmodemHeader {
  type: number
  typeName: string
  position: number
  flags: Uint8Array
  crcOk: boolean
}

export interface ZmodemData {
  data: Uint8Array
  frameEnd: number
  crcOk: boolean
}

export type ParserCallback = {
  onHeader?: (header: ZmodemHeader) => void
  onData?: (data: ZmodemData) => void
  onCancel?: () => void
}

/**
 * Parse hex digit to value
 */
function hexToValue(c: number): number {
  if (c >= 0x30 && c <= 0x39) return c - 0x30        // '0'-'9'
  if (c >= 0x61 && c <= 0x66) return c - 0x61 + 10   // 'a'-'f'
  if (c >= 0x41 && c <= 0x46) return c - 0x41 + 10   // 'A'-'F'
  return -1
}

export class ZmodemParser {
  private state: ParserState = ParserState.IDLE
  private headerBuffer: number[] = []
  private dataBuffer: number[] = []
  private crcBuffer: number[] = []
  private pendingFrameEnd: number = 0
  private useCrc32: boolean = false
  private escapeNext: boolean = false
  private cancelCount: number = 0
  private callback: ParserCallback

  constructor(callback: ParserCallback) {
    this.callback = callback
  }

  /**
   * Reset parser state
   */
  reset(): void {
    // console.log(`[PARSER] reset() called, previous state=${ParserState[this.state]}`)
    this.state = ParserState.IDLE
    this.headerBuffer = []
    this.dataBuffer = []
    this.crcBuffer = []
    this.pendingFrameEnd = 0
    this.escapeNext = false
    this.cancelCount = 0
  }

  /**
   * Start data mode for receiving subpackets
   */
  startDataMode(useCrc32: boolean): void {
    this.state = ParserState.IN_DATA
    this.useCrc32 = useCrc32
    this.dataBuffer = []
    this.escapeNext = false
  }

  /**
   * Check if in data mode
   */
  isInDataMode(): boolean {
    return this.state === ParserState.IN_DATA
  }

  /**
   * Get current data buffer length (for partial progress reporting)
   */
  getDataBufferLength(): number {
    return this.dataBuffer.length
  }

  /**
   * Get current CRC mode (set by last header type)
   */
  getUseCrc32(): boolean {
    return this.useCrc32
  }

  /**
   * Process incoming bytes
   */
  parse(bytes: Uint8Array): void {
    for (let i = 0; i < bytes.length; i++) {
      this.processByte(bytes[i])
    }
  }

  /**
   * Process a single byte
   */
  private processByte(byte: number): void {
    // Check for cancel sequence (5+ CAN bytes) - only in non-data modes
    // In data mode, 0x18 is ZDLE (escape), not CAN
    if (this.state !== ParserState.IN_DATA && this.state !== ParserState.IN_DATA_CRC) {
      if (byte === 0x18) { // CAN
        this.cancelCount++
        if (this.cancelCount >= 5) {
          // console.log(`[PARSER] Cancel detected! State=${ParserState[this.state]}, cancelCount=${this.cancelCount}`)
          this.callback.onCancel?.()
          this.reset()
          return
        }
      } else {
        this.cancelCount = 0
      }
    }

    // Handle different states
    switch (this.state) {
      case ParserState.IDLE:
        if (byte === ZPAD) {
          this.state = ParserState.GOT_ZPAD
        }
        break

      case ParserState.GOT_ZPAD:
        if (byte === ZPAD) {
          this.state = ParserState.GOT_ZPAD2
        } else if (byte === ZDLE) {
          this.state = ParserState.GOT_ZDLE
        } else {
          this.state = ParserState.IDLE
        }
        break

      case ParserState.GOT_ZPAD2:
        if (byte === ZDLE) {
          this.state = ParserState.GOT_ZDLE
        } else if (byte === ZPAD) {
          // Stay in GOT_ZPAD2
        } else {
          this.state = ParserState.IDLE
        }
        break

      case ParserState.GOT_ZDLE:
        if (byte === ZBIN) {
          this.state = ParserState.IN_BIN16_HEADER
          this.headerBuffer = []
          this.useCrc32 = false
          this.escapeNext = false
        } else if (byte === ZBIN32) {
          this.state = ParserState.IN_BIN32_HEADER
          this.headerBuffer = []
          this.useCrc32 = true
          this.escapeNext = false
        } else if (byte === ZHEX) {
          this.state = ParserState.IN_HEX_HEADER
          this.headerBuffer = []
        } else {
          this.state = ParserState.IDLE
        }
        break

      case ParserState.IN_HEX_HEADER:
        this.processHexHeaderByte(byte)
        break

      case ParserState.IN_BIN16_HEADER:
        this.processBinaryHeaderByte(byte, false)
        break

      case ParserState.IN_BIN32_HEADER:
        this.processBinaryHeaderByte(byte, true)
        break

      case ParserState.IN_DATA:
        this.processDataByte(byte)
        break

      case ParserState.IN_DATA_CRC:
        this.processDataCrcByte(byte)
        break
    }
  }

  /**
   * Process hex header byte
   * Format: type[2] p0[2] p1[2] p2[2] p3[2] crc[4] CR LF [XON]
   */
  private processHexHeaderByte(byte: number): void {
    // Skip CR, LF, XON at the end
    if (byte === 0x0d || byte === 0x0a || byte === 0x8a || byte === 0x11) {
      if (this.headerBuffer.length >= 14) {
        this.finalizeHexHeader()
      }
      return
    }

    const val = hexToValue(byte)
    if (val >= 0) {
      this.headerBuffer.push(val)

      // 14 hex digits = type(2) + position(8) + crc(4)
      if (this.headerBuffer.length === 14) {
        // Wait for CR/LF
      }
    } else {
      // Invalid hex character
      this.state = ParserState.IDLE
      this.headerBuffer = []
    }
  }

  /**
   * Finalize hex header
   */
  private finalizeHexHeader(): void {
    if (this.headerBuffer.length < 14) {
      this.state = ParserState.IDLE
      return
    }

    // Parse hex values
    const type = (this.headerBuffer[0] << 4) | this.headerBuffer[1]
    const p0 = (this.headerBuffer[2] << 4) | this.headerBuffer[3]
    const p1 = (this.headerBuffer[4] << 4) | this.headerBuffer[5]
    const p2 = (this.headerBuffer[6] << 4) | this.headerBuffer[7]
    const p3 = (this.headerBuffer[8] << 4) | this.headerBuffer[9]
    const crcHi = (this.headerBuffer[10] << 4) | this.headerBuffer[11]
    const crcLo = (this.headerBuffer[12] << 4) | this.headerBuffer[13]
    const receivedCrc = (crcHi << 8) | crcLo

    // Calculate CRC
    const headerBytes = new Uint8Array([type, p0, p1, p2, p3])
    const calculatedCrc = crc16(headerBytes)

    const position = p0 | (p1 << 8) | (p2 << 16) | (p3 << 24)
    const crcOk = receivedCrc === calculatedCrc

    // IMPORTANT: Set state to IDLE before callback, so callback can switch to data mode
    this.state = ParserState.IDLE
    this.headerBuffer = []

    this.callback.onHeader?.({
      type,
      typeName: FRAME_NAMES[type] || `UNKNOWN(${type})`,
      position,
      flags: new Uint8Array([p0, p1, p2, p3]),
      crcOk
    })
  }

  /**
   * Process binary header byte
   */
  private processBinaryHeaderByte(byte: number, isCrc32: boolean): void {
    // Handle escape sequences
    if (this.escapeNext) {
      this.escapeNext = false
      if (byte === ZRUB0) {
        byte = 0x7f
      } else if (byte === ZRUB1) {
        byte = 0xff
      } else {
        byte = byte ^ 0x40
      }
      this.headerBuffer.push(byte)
    } else if (byte === ZDLE) {
      this.escapeNext = true
      return
    } else {
      this.headerBuffer.push(byte)
    }

    // Expected length: type(1) + position(4) + crc(2 or 4)
    const expectedLen = isCrc32 ? 9 : 7

    if (this.headerBuffer.length === expectedLen) {
      this.finalizeBinaryHeader(isCrc32)
    }
  }

  /**
   * Finalize binary header
   */
  private finalizeBinaryHeader(isCrc32: boolean): void {
    const type = this.headerBuffer[0]
    const p0 = this.headerBuffer[1]
    const p1 = this.headerBuffer[2]
    const p2 = this.headerBuffer[3]
    const p3 = this.headerBuffer[4]

    let crcOk: boolean
    const headerBytes = new Uint8Array([type, p0, p1, p2, p3])

    if (isCrc32) {
      // >>> 0 keeps the value unsigned; (byte << 24) alone flips the
      // sign when the high byte is >= 0x80, which made half of all
      // valid header CRCs appear to mismatch
      const receivedCrc = (
        this.headerBuffer[5] |
        (this.headerBuffer[6] << 8) |
        (this.headerBuffer[7] << 16) |
        (this.headerBuffer[8] << 24)
      ) >>> 0
      let calculatedCrc = crc32(headerBytes)
      calculatedCrc = crc32Finish(calculatedCrc)
      crcOk = receivedCrc === calculatedCrc
    } else {
      const receivedCrc = (this.headerBuffer[5] << 8) | this.headerBuffer[6]
      // Note: Binary CRC16 headers also do NOT use crc16Finish
      const calculatedCrc = crc16(headerBytes)
      crcOk = receivedCrc === calculatedCrc
    }

    const position = p0 | (p1 << 8) | (p2 << 16) | (p3 << 24)

    // IMPORTANT: Set state to IDLE before callback, so callback can switch to data mode
    this.state = ParserState.IDLE
    this.headerBuffer = []

    this.callback.onHeader?.({
      type,
      typeName: FRAME_NAMES[type] || `UNKNOWN(${type})`,
      position,
      flags: new Uint8Array([p0, p1, p2, p3]),
      crcOk
    })
  }

  /**
   * Process data byte
   */
  private processDataByte(byte: number): void {
    if (this.escapeNext) {
      this.escapeNext = false

      // Check for frame end markers
      if (byte === ZCRCE || byte === ZCRCG || byte === ZCRCQ || byte === ZCRCW) {
        this.finalizeDataSubpacket(byte)
        return
      }

      // Unescape byte
      if (byte === ZRUB0) {
        byte = 0x7f
      } else if (byte === ZRUB1) {
        byte = 0xff
      } else {
        byte = byte ^ 0x40
      }
      this.dataBuffer.push(byte)
    } else if (byte === ZDLE) {
      this.escapeNext = true
    } else {
      this.dataBuffer.push(byte)
    }
  }

  /**
   * Start collecting CRC bytes after frame end marker
   */
  private finalizeDataSubpacket(frameEnd: number): void {
    // Save frame end and switch to CRC collection state
    this.pendingFrameEnd = frameEnd
    this.crcBuffer = []
    this.state = ParserState.IN_DATA_CRC
    // escapeNext stays as-is (should be false after processing frame end marker)
  }

  /**
   * Process CRC byte after frame end marker
   */
  private processDataCrcByte(byte: number): void {
    const expectedCrcLen = this.useCrc32 ? 4 : 2

    if (this.escapeNext) {
      this.escapeNext = false
      // Unescape byte
      if (byte === ZRUB0) {
        byte = 0x7f
      } else if (byte === ZRUB1) {
        byte = 0xff
      } else {
        byte = byte ^ 0x40
      }
      this.crcBuffer.push(byte)
    } else if (byte === ZDLE) {
      this.escapeNext = true
      return
    } else {
      this.crcBuffer.push(byte)
    }

    // Check if we have all CRC bytes
    if (this.crcBuffer.length === expectedCrcLen) {
      this.emitDataSubpacket()
    }
  }

  /**
   * Emit data subpacket after CRC is collected
   */
  private emitDataSubpacket(): void {
    const data = new Uint8Array(this.dataBuffer)
    const frameEnd = this.pendingFrameEnd
    const crcOk = this.verifyDataCrc(data, frameEnd)

    // Clear buffers BEFORE callback
    this.dataBuffer = []
    this.crcBuffer = []

    // Determine next state based on frame end marker BEFORE callback
    // (callback may change the state, e.g., by calling reset())
    if (frameEnd === ZCRCE || frameEnd === ZCRCW) {
      // ZCRCE: End of frame, header follows
      // ZCRCW: End of frame, ACK expected, then header follows
      this.state = ParserState.IDLE
    } else {
      // ZCRCG, ZCRCQ: More data follows immediately
      this.state = ParserState.IN_DATA
    }

    // Call callback AFTER state is set
    this.callback.onData?.({
      data,
      frameEnd,
      crcOk
    })
  }

  /**
   * Verify data subpacket CRC against collected CRC bytes.
   */
  private verifyDataCrc(data: Uint8Array, frameEnd: number): boolean {
    if (this.useCrc32) {
      const receivedCrc = (
        this.crcBuffer[0] |
        (this.crcBuffer[1] << 8) |
        (this.crcBuffer[2] << 16) |
        (this.crcBuffer[3] << 24)
      ) >>> 0
      let calculatedCrc = crc32(data)
      calculatedCrc = crc32Update(calculatedCrc, frameEnd)
      calculatedCrc = crc32Finish(calculatedCrc)
      return receivedCrc === calculatedCrc
    }

    const receivedCrc = (this.crcBuffer[0] << 8) | this.crcBuffer[1]
    let calculatedCrc = crc16(data)
    calculatedCrc = crc16Update(calculatedCrc, frameEnd)
    calculatedCrc = crc16Finish(calculatedCrc)
    return receivedCrc === calculatedCrc
  }
}


/**
 * Detect ZMODEM start sequence in data
 * Returns 'send' if ZRQINIT detected (sender wants to send)
 * Returns 'receive' if ZRINIT detected (receiver ready)
 * Returns null if no ZMODEM detected
 */
export function detectZmodem(data: Uint8Array): 'send' | 'receive' | null {
  // Look for ZRQINIT pattern: **ZDLE B 00 (hex header with type 0)
  // Or binary: **ZDLE A 00 (binary header with type 0)
  const str = new TextDecoder('latin1').decode(data)

  // ZRQINIT in hex: **^XB00... (B = ZHEX, 00 = ZRQINIT)
  if (str.includes('B00000000000000')) {
    return 'send'
  }

  // ZRINIT pattern for upload detection
  if (str.includes('B0100')) {
    return 'receive'
  }

  return null
}
