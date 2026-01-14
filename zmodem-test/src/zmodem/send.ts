/**
 * ZMODEM Send (sz) Implementation
 */

import {
  ZRQINIT, ZRINIT, ZSINIT, ZACK, ZFILE, ZSKIP, ZNAK, ZFIN, ZRPOS, ZDATA, ZEOF,
  ZCRCE, ZCRCG, ZCRCQ, ZCRCW,
  CANFDX, CANOVIO, CANFC32,
  ZCBIN,
  ZF0,
  FRAME_NAMES
} from './constants.js'
import {
  encodeHexHeader,
  encodeBinaryHeader16,
  encodeBinaryHeader32,
  encodeDataSubpacket16,
  encodeDataSubpacket32,
  encodeCancelSequence
} from './encode.js'
import { ZmodemParser, type ZmodemHeader, type ZmodemData } from './decode.js'

// Send states
enum SendState {
  IDLE,
  WAIT_ZRINIT,      // Waiting for receiver's ZRINIT
  WAIT_ZRPOS,       // Waiting for ZRPOS after ZFILE
  SENDING_DATA,     // Sending file data
  WAIT_ZACK,        // Waiting for ZACK after data
  WAIT_ZFIN_ACK,    // Waiting for final ZFIN ack
  COMPLETE
}

export interface FileToSend {
  name: string
  data: Uint8Array
  mtime?: number
  mode?: number
}

export interface SendCallbacks {
  onSend: (data: Uint8Array) => void
  onProgress?: (sent: number, total: number) => void
  onFileComplete?: (name: string) => void
  onSessionComplete?: () => void
  onError?: (error: string) => void
}

// Subpacket size (8KB is common for ZMODEM)
const SUBPACKET_SIZE = 8192

export class ZmodemSender {
  private state: SendState = SendState.IDLE
  private parser: ZmodemParser
  private callbacks: SendCallbacks
  private files: FileToSend[] = []
  private currentFileIndex: number = 0
  private currentPosition: number = 0
  private useCrc32: boolean = true
  private debug: boolean = false
  private receiverFlags: number = 0

  constructor(callbacks: SendCallbacks) {
    this.callbacks = callbacks
    this.parser = new ZmodemParser({
      onHeader: this.handleHeader.bind(this),
      onData: this.handleData.bind(this),
      onCancel: this.handleCancel.bind(this)
    })
  }

  /**
   * Enable debug logging
   */
  setDebug(enabled: boolean): void {
    this.debug = enabled
  }

  /**
   * Log debug message
   */
  private log(msg: string): void {
    if (this.debug) {
      console.log(`[SZ] ${msg}`)
    }
  }

  /**
   * Start sending files
   */
  start(files: FileToSend[]): void {
    this.files = files
    this.currentFileIndex = 0
    this.currentPosition = 0
    this.state = SendState.WAIT_ZRINIT

    this.log(`Starting send session with ${files.length} file(s)`)

    // Send ZRQINIT to request receiver init
    this.sendZRQINIT()
  }

  /**
   * Process incoming data from receiver
   */
  processData(data: Uint8Array): void {
    this.log(`Received ${data.length} bytes, state=${SendState[this.state]}`)

    if (this.debug) {
      const hex = Array.from(data.slice(0, 64))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ')
      this.log(`Data: ${hex}${data.length > 64 ? '...' : ''}`)
    }

    this.parser.parse(data)
  }

  /**
   * Send ZRQINIT (request receiver init)
   */
  private sendZRQINIT(): void {
    const header = encodeHexHeader(ZRQINIT, 0)
    this.log(`Sending ZRQINIT: ${this.hexDump(header)}`)
    this.callbacks.onSend(header)
  }

  /**
   * Send ZFILE header and file info
   */
  private sendZFILE(): void {
    const file = this.files[this.currentFileIndex]
    if (!file) {
      this.log('No more files to send')
      this.sendZFIN()
      return
    }

    this.log(`Sending ZFILE for: ${file.name} (${file.data.length} bytes), useCrc32=${this.useCrc32}`)

    // Send ZFILE header with binary flag
    const header = this.useCrc32
      ? encodeBinaryHeader32(ZFILE, 0)
      : encodeBinaryHeader16(ZFILE, 0)
    this.callbacks.onSend(header)

    // Send file info as data subpacket
    // Format: filename\0size mtime mode\0
    const mtime = file.mtime || Math.floor(Date.now() / 1000)
    const mode = file.mode || 0o644
    const fileInfo = `${file.name}\0${file.data.length} ${mtime.toString(8)} ${mode.toString(8)}\0`
    const fileInfoBytes = new TextEncoder().encode(fileInfo)

    const dataPacket = this.useCrc32
      ? encodeDataSubpacket32(fileInfoBytes, ZCRCW)
      : encodeDataSubpacket16(fileInfoBytes, ZCRCW)
    this.callbacks.onSend(dataPacket)

    this.state = SendState.WAIT_ZRPOS
  }

  /**
   * Send ZDATA header
   */
  private sendZDATA(position: number): void {
    this.log(`Sending ZDATA at position ${position}`)
    const header = this.useCrc32
      ? encodeBinaryHeader32(ZDATA, position)
      : encodeBinaryHeader16(ZDATA, position)
    this.callbacks.onSend(header)
  }

  /**
   * Send file data from current position
   */
  private sendFileData(): void {
    const file = this.files[this.currentFileIndex]
    if (!file) return

    const total = file.data.length

    this.log(`Sending file data from position ${this.currentPosition}, useCrc32=${this.useCrc32}`)

    // Send ZDATA header first
    this.sendZDATA(this.currentPosition)

    // Send data in subpackets
    while (this.currentPosition < total) {
      const remaining = total - this.currentPosition
      const chunkSize = Math.min(SUBPACKET_SIZE, remaining)
      const chunk = file.data.slice(this.currentPosition, this.currentPosition + chunkSize)

      const isLast = this.currentPosition + chunkSize >= total

      // Use ZCRCE for last packet (end of frame, header follows)
      // Use ZCRCG for middle packets (more data follows)
      const frameEnd = isLast ? ZCRCE : ZCRCG

      const packet = this.useCrc32
        ? encodeDataSubpacket32(chunk, frameEnd)
        : encodeDataSubpacket16(chunk, frameEnd)
      this.callbacks.onSend(packet)

      this.currentPosition += chunkSize

      this.callbacks.onProgress?.(this.currentPosition, total)

      this.log(`Sent ${chunkSize} bytes, position=${this.currentPosition}, frameEnd=${isLast ? 'ZCRCE' : 'ZCRCG'}`)
    }

    // After sending all data, send ZEOF
    this.sendZEOF()
  }

  /**
   * Send ZEOF (end of file)
   */
  private sendZEOF(): void {
    const file = this.files[this.currentFileIndex]
    const position = file ? file.data.length : 0

    this.log(`Sending ZEOF at position ${position}`)
    const header = this.useCrc32
      ? encodeBinaryHeader32(ZEOF, position)
      : encodeBinaryHeader16(ZEOF, position)
    this.callbacks.onSend(header)

    this.state = SendState.WAIT_ZRINIT
  }

  /**
   * Send ZFIN (session complete)
   */
  private sendZFIN(): void {
    this.log('Sending ZFIN')
    const header = encodeHexHeader(ZFIN, 0)
    this.callbacks.onSend(header)
    this.state = SendState.WAIT_ZFIN_ACK
  }

  /**
   * Handle received header
   */
  private handleHeader(header: ZmodemHeader): void {
    this.log(`Received header: ${header.typeName} position=${header.position} crcOk=${header.crcOk}`)

    if (!header.crcOk) {
      this.log('CRC error in header')
      return
    }

    switch (header.type) {
      case ZRINIT:
        // Receiver is ready - flags are in ZF0 (index 3)
        this.receiverFlags = header.flags[ZF0]
        this.useCrc32 = (this.receiverFlags & CANFC32) !== 0
        this.log(`Got ZRINIT, flags=0x${this.receiverFlags.toString(16)}, useCrc32=${this.useCrc32}`)

        if (this.state === SendState.WAIT_ZRINIT) {
          // Send first file
          this.sendZFILE()
        } else if (this.state === SendState.WAIT_ZRINIT) {
          // After ZEOF, receiver sends ZRINIT for next file
          this.currentFileIndex++
          if (this.currentFileIndex < this.files.length) {
            this.currentPosition = 0
            this.sendZFILE()
          } else {
            // All files sent
            this.sendZFIN()
          }
        }
        break

      case ZRPOS:
        // Receiver requests data from position
        this.log(`Got ZRPOS at position ${header.position}`)
        this.currentPosition = header.position
        this.state = SendState.SENDING_DATA
        this.sendFileData()
        break

      case ZACK:
        this.log(`Got ZACK at position ${header.position}`)
        if (this.state === SendState.WAIT_ZRINIT) {
          // After ZEOF, check if more files
          this.currentFileIndex++
          if (this.currentFileIndex < this.files.length) {
            this.currentPosition = 0
            this.sendZFILE()
          } else {
            this.sendZFIN()
          }
        }
        break

      case ZSKIP:
        // Receiver wants to skip this file
        this.log('Got ZSKIP, skipping file')
        this.callbacks.onFileComplete?.(this.files[this.currentFileIndex]?.name || '')
        this.currentFileIndex++
        if (this.currentFileIndex < this.files.length) {
          this.currentPosition = 0
          this.sendZFILE()
        } else {
          this.sendZFIN()
        }
        break

      case ZNAK:
        // Receiver requests retransmit
        this.log(`Got ZNAK at position ${header.position}`)
        this.currentPosition = header.position
        this.sendFileData()
        break

      case ZFIN:
        // Session complete
        this.log('Got ZFIN, sending OO')
        // Send "OO" to complete
        const oo = new Uint8Array([0x4f, 0x4f])
        this.callbacks.onSend(oo)
        this.state = SendState.COMPLETE
        this.callbacks.onSessionComplete?.()
        break

      default:
        this.log(`Unhandled header type: ${header.typeName}`)
    }
  }

  /**
   * Handle received data (not expected during send)
   */
  private handleData(data: ZmodemData): void {
    this.log(`Unexpected data received: ${data.data.length} bytes`)
  }

  /**
   * Handle cancel
   */
  private handleCancel(): void {
    this.log('Transfer cancelled by receiver')
    this.callbacks.onError?.('Transfer cancelled by receiver')
    this.state = SendState.IDLE
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
