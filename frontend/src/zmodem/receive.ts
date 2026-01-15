/**
 * ZMODEM Receive Implementation
 */

import {
  ZRQINIT, ZRINIT, ZSINIT, ZACK, ZFILE, ZSKIP, ZNAK, ZFIN, ZRPOS, ZDATA, ZEOF,
  ZCRCE, ZCRCG, ZCRCQ, ZCRCW,
  CANFDX, CANOVIO, CANFC32,
  FRAME_NAMES
} from './constants'
import { encodeHexHeader, encodeBinaryHeader32 } from './encode'
import { ZmodemParser, type ZmodemHeader, type ZmodemData } from './decode'

// Receive states
enum ReceiveState {
  IDLE,
  WAIT_ZFILE,
  WAIT_ZSINIT_DATA,  // Waiting for ZSINIT attention string
  WAIT_ZDATA,
  RECEIVING_DATA,
  WAIT_ZEOF,
  COMPLETE
}

export interface FileInfo {
  name: string
  size: number
  mtime?: number
  mode?: number
}

export interface ReceiveCallbacks {
  onSend: (data: Uint8Array) => void
  onFileStart?: (info: FileInfo) => void
  onProgress?: (received: number, total: number) => void
  onFileComplete?: (info: FileInfo, data: Uint8Array) => void
  onSessionComplete?: () => void
  onError?: (error: string) => void
}

export class ZmodemReceiver {
  private state: ReceiveState = ReceiveState.IDLE
  private parser: ZmodemParser
  private callbacks: ReceiveCallbacks
  private useCrc32: boolean = true
  private fileInfo: FileInfo | null = null
  private fileDataChunks: Uint8Array[] = []  // Use chunks to support large files (>128MB)
  private bytesReceived: number = 0
  private lastPosition: number = 0
  private debug: boolean = false

  constructor(callbacks: ReceiveCallbacks) {
    this.callbacks = callbacks
    this.parser = new ZmodemParser({
      onHeader: this.handleHeader.bind(this),
      onData: this.handleData.bind(this),
      onCancel: this.handleCancel.bind(this)
    })
  }

  /**
   * Log debug message
   */
  private log(msg: string): void {
    if (this.debug) {
      console.log(`[RZ] ${msg}`)
    }
  }

  /**
   * Start receiving - send ZRINIT
   */
  start(): void {
    this.log('Starting receive session')
    this.state = ReceiveState.WAIT_ZFILE
    this.sendZRINIT()
  }

  /**
   * Process incoming data from sender
   */
  processData(data: Uint8Array): void {
    this.log(`Received ${data.length} bytes, state=${ReceiveState[this.state]}`)

    // Log hex dump
    if (this.debug) {
      const hex = Array.from(data.slice(0, 64))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ')
      this.log(`Data: ${hex}${data.length > 64 ? '...' : ''}`)
    }

    this.parser.parse(data)

    // Report partial progress during data reception
    // This provides smoother progress updates, especially over slow networks
    // where multiple subpackets may arrive bundled together
    if (this.state === ReceiveState.RECEIVING_DATA && this.fileInfo) {
      const partialBytes = this.bytesReceived + this.parser.getDataBufferLength()
      this.callbacks.onProgress?.(partialBytes, this.fileInfo.size)
    }
  }

  /**
   * Send ZRINIT (receiver ready)
   */
  private sendZRINIT(): void {
    // Build flags: support full duplex, overlap I/O, and CRC32
    const flags = new Uint8Array([CANFDX | CANOVIO | CANFC32, 0, 0, 0])

    // Use hex header for ZRINIT
    const header = encodeHexHeader(ZRINIT, flags[0])
    this.log(`Sending ZRINIT: ${this.hexDump(header)}`)
    this.callbacks.onSend(header)
  }

  /**
   * Send ZRPOS (request position)
   */
  private sendZRPOS(position: number): void {
    const header = encodeHexHeader(ZRPOS, position)
    this.log(`Sending ZRPOS at position ${position}: ${this.hexDump(header)}`)
    this.callbacks.onSend(header)
  }

  /**
   * Send ZACK
   */
  private sendZACK(position: number): void {
    const header = encodeHexHeader(ZACK, position)
    this.log(`Sending ZACK at position ${position}`)
    this.callbacks.onSend(header)
  }

  /**
   * Send ZFIN
   */
  private sendZFIN(): void {
    const header = encodeHexHeader(ZFIN, 0)
    this.log('Sending ZFIN')
    this.callbacks.onSend(header)

    // Send OO
    const oo = new Uint8Array([0x4f, 0x4f]) // 'OO'
    this.callbacks.onSend(oo)
  }

  /**
   * Handle received header
   */
  private handleHeader(header: ZmodemHeader): void {
    this.log(`Received header: ${header.typeName} position=${header.position} crcOk=${header.crcOk}`)

    if (!header.crcOk) {
      this.log('CRC error in header, sending ZNAK')
      // Send ZNAK
      const znak = encodeHexHeader(ZNAK, this.lastPosition)
      this.callbacks.onSend(znak)
      return
    }

    switch (header.type) {
      case ZRQINIT:
        // Sender requesting init, send ZRINIT
        this.log('Got ZRQINIT, sending ZRINIT')
        this.sendZRINIT()
        break

      case ZSINIT:
        // Sender init - need to read attention string first before ACK
        // ZSINIT always uses hex header, so attention string uses CRC16
        this.log('Got ZSINIT, switching to data mode for attention string')
        this.state = ReceiveState.WAIT_ZSINIT_DATA
        this.parser.startDataMode(false)  // CRC16 for hex header data
        break

      case ZFILE:
        // File header - need to receive subpacket with file info
        // Use CRC mode from header type (ZBIN=CRC16, ZBIN32=CRC32)
        this.log('Got ZFILE, switching to data mode for file info')
        this.state = ReceiveState.WAIT_ZDATA
        this.parser.startDataMode(this.parser.getUseCrc32())
        break

      case ZDATA:
        // Data follows
        // Use CRC mode from header type (ZBIN=CRC16, ZBIN32=CRC32)
        this.log(`Got ZDATA at position ${header.position}`)
        if (this.state === ReceiveState.WAIT_ZDATA || this.state === ReceiveState.RECEIVING_DATA) {
          this.lastPosition = header.position
          this.state = ReceiveState.RECEIVING_DATA
          this.parser.startDataMode(this.parser.getUseCrc32())
        }
        break

      case ZEOF:
        // End of file
        this.log(`Got ZEOF, file complete at ${header.position} bytes`)
        this.handleFileComplete()
        this.sendZRINIT() // Ready for next file
        break

      case ZFIN:
        // Session complete
        this.log('Got ZFIN, session complete')
        this.sendZFIN()
        this.state = ReceiveState.COMPLETE
        this.callbacks.onSessionComplete?.()
        break

      default:
        this.log(`Unhandled header type: ${header.typeName}`)
    }
  }

  /**
   * Handle received data subpacket
   */
  private handleData(data: ZmodemData): void {
    this.log(`Received data subpacket: ${data.data.length} bytes, frameEnd=${this.frameEndName(data.frameEnd)}, crcOk=${data.crcOk}`)

    if (!data.crcOk) {
      this.log('CRC error in data, sending ZNAK')
      const znak = encodeHexHeader(ZNAK, this.lastPosition)
      this.callbacks.onSend(znak)
      return
    }

    if (this.state === ReceiveState.WAIT_ZSINIT_DATA) {
      // Attention string from ZSINIT - just acknowledge and continue
      this.log(`Got ZSINIT attention string: ${data.data.length} bytes`)

      if (data.frameEnd === ZCRCW) {
        // Reset parser and send ZACK
        this.parser.reset()
        this.state = ReceiveState.WAIT_ZFILE
        this.sendZACK(1)  // lrzsz sends ZACK with position 1
      } else {
        // Unexpected frame end, send ZNAK
        this.log(`Unexpected frame end in ZSINIT: ${this.frameEndName(data.frameEnd)}`)
        const znak = encodeHexHeader(ZNAK, 0)
        this.callbacks.onSend(znak)
        this.parser.reset()
      }
    } else if (this.state === ReceiveState.WAIT_ZDATA && !this.fileInfo) {
      // This is file info from ZFILE
      this.parseFileInfo(data.data)
      this.state = ReceiveState.WAIT_ZDATA

      // Reset parser to wait for ZDATA header
      this.parser.reset()

      // Request data from position 0
      this.sendZRPOS(0)
    } else if (this.state === ReceiveState.WAIT_ZDATA && this.fileInfo) {
      // Duplicate file info (sender retrying), just reset parser and ignore
      this.log('Ignoring duplicate file info')
      this.parser.reset()
    } else if (this.state === ReceiveState.RECEIVING_DATA) {
      // Actual file data - store as chunks to support large files
      // Copy the data to avoid reference issues
      const chunk = new Uint8Array(data.data.length)
      chunk.set(data.data)
      this.fileDataChunks.push(chunk)
      this.bytesReceived += data.data.length
      this.lastPosition = this.bytesReceived

      this.callbacks.onProgress?.(this.bytesReceived, this.fileInfo?.size || 0)

      // Handle frame end
      switch (data.frameEnd) {
        case ZCRCE:
          // End of frame, wait for next header
          this.log('ZCRCE - waiting for next header')
          this.parser.reset()
          break

        case ZCRCG:
          // More data follows immediately
          this.log('ZCRCG - more data follows')
          break

        case ZCRCQ:
          // More data follows, ACK expected
          this.log('ZCRCQ - sending ACK')
          this.sendZACK(this.lastPosition)
          break

        case ZCRCW:
          // End of frame, ACK expected
          this.log('ZCRCW - sending ACK')
          this.sendZACK(this.lastPosition)
          this.parser.reset()
          break
      }
    }
  }

  /**
   * Parse file info from ZFILE subpacket
   * Format: filename\0size mtime mode ...\0
   */
  private parseFileInfo(data: Uint8Array): void {
    // Find null terminator to split filename and metadata
    let nullIndex = data.indexOf(0)
    if (nullIndex === -1) nullIndex = data.length

    // Decode filename using CP949 (Korean BBS encoding)
    // Note: Browser's 'euc-kr' TextDecoder actually handles full CP949 per WHATWG Encoding Standard
    const filenameBytes = data.slice(0, nullIndex)
    let name: string
    try {
      name = new TextDecoder('euc-kr').decode(filenameBytes)
    } catch {
      // Fallback to latin1 if decoding fails
      name = new TextDecoder('latin1').decode(filenameBytes)
    }
    if (!name) name = 'unknown'

    let size = 0
    let mtime = 0
    let mode = 0

    // Parse metadata (after null terminator) - always ASCII
    if (nullIndex < data.length - 1) {
      const metaBytes = data.slice(nullIndex + 1)
      const metaStr = new TextDecoder('latin1').decode(metaBytes)
      const meta = metaStr.trim().split(/\s+/)
      size = parseInt(meta[0], 10) || 0
      mtime = parseInt(meta[1], 8) || 0  // Octal
      mode = parseInt(meta[2], 8) || 0   // Octal
    }

    this.fileInfo = { name, size, mtime, mode }
    this.fileDataChunks = []
    this.bytesReceived = 0
    this.lastPosition = 0

    this.log(`File info: name=${name}, size=${size}, mtime=${mtime}, mode=${mode.toString(8)}`)
    this.callbacks.onFileStart?.(this.fileInfo)
  }

  /**
   * Handle file complete
   */
  private handleFileComplete(): void {
    if (this.fileInfo) {
      // Concatenate all chunks into a single Uint8Array
      const totalSize = this.fileDataChunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const data = new Uint8Array(totalSize)
      let offset = 0
      for (const chunk of this.fileDataChunks) {
        data.set(chunk, offset)
        offset += chunk.length
      }
      this.log(`File complete: ${this.fileInfo.name}, ${data.length} bytes`)
      this.callbacks.onFileComplete?.(this.fileInfo, data)
    }

    this.fileInfo = null
    this.fileDataChunks = []
    this.bytesReceived = 0
    this.state = ReceiveState.WAIT_ZFILE
  }

  /**
   * Handle cancel
   */
  private handleCancel(): void {
    this.log('Transfer cancelled')
    this.callbacks.onError?.('Transfer cancelled by sender')
    this.state = ReceiveState.IDLE
  }

  /**
   * Get frame end name for debugging
   */
  private frameEndName(fe: number): string {
    switch (fe) {
      case ZCRCE: return 'ZCRCE'
      case ZCRCG: return 'ZCRCG'
      case ZCRCQ: return 'ZCRCQ'
      case ZCRCW: return 'ZCRCW'
      default: return `UNKNOWN(${fe})`
    }
  }

  /**
   * Hex dump for debugging
   */
  private hexDump(data: Uint8Array): string {
    return Array.from(data)
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ')
  }
}
