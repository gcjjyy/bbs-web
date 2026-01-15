/**
 * ZMODEM Send Implementation
 */

import {
  ZRQINIT, ZRINIT, ZACK, ZFILE, ZSKIP, ZNAK, ZFIN, ZRPOS, ZDATA, ZEOF,
  ZCRCE, ZCRCG, ZCRCW,
  CANFC32,
  ZF0
} from './constants'
import {
  encodeHexHeader,
  encodeBinaryHeader16,
  encodeBinaryHeader32,
  encodeDataSubpacket16,
  encodeDataSubpacket32
} from './encode'
import { ZmodemParser, type ZmodemHeader, type ZmodemData } from './decode'

// Send states
enum SendState {
  IDLE,
  WAIT_ZRINIT,      // Waiting for receiver's ZRINIT
  WAIT_ZRPOS,       // Waiting for ZRPOS after ZFILE
  SENDING_DATA,     // Sending file data
  WAIT_ZFIN_ACK,    // Waiting for final ZFIN ack
  COMPLETE
}

export interface FileToSend {
  name: string
  encodedName?: Uint8Array  // EUC-KR encoded filename from server
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

// Progress update interval (bytes)
const PROGRESS_UPDATE_INTERVAL = 1024 * 1024  // 1MB

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

  setDebug(enabled: boolean): void {
    this.debug = enabled
  }

  private log(msg: string): void {
    if (this.debug) {
      console.log(`[SZ] ${msg}`)
    }
  }

  start(files: FileToSend[]): void {
    this.files = files
    this.currentFileIndex = 0
    this.currentPosition = 0
    this.state = SendState.WAIT_ZRINIT

    this.log(`Starting send session with ${files.length} file(s)`)
    this.sendZRQINIT()
  }

  processData(data: Uint8Array): void {
    this.log(`Received ${data.length} bytes, state=${SendState[this.state]}`)
    this.parser.parse(data)
  }

  private sendZRQINIT(): void {
    const header = encodeHexHeader(ZRQINIT, 0)
    this.log(`Sending ZRQINIT`)
    this.callbacks.onSend(header)
  }

  private sendZFILE(): void {
    const file = this.files[this.currentFileIndex]
    if (!file) {
      this.log('No more files to send')
      this.sendZFIN()
      return
    }

    this.log(`Sending ZFILE for: ${file.name} (${file.data.length} bytes)`)

    const header = this.useCrc32
      ? encodeBinaryHeader32(ZFILE, 0)
      : encodeBinaryHeader16(ZFILE, 0)
    this.callbacks.onSend(header)

    const mtime = file.mtime || Math.floor(Date.now() / 1000)
    const mode = file.mode || 0o644

    // Use CP949 encoded filename if available, otherwise use UTF-8
    const filenameBytes = file.encodedName || new TextEncoder().encode(file.name)
    const metaInfo = `${file.data.length} ${mtime.toString(8)} ${mode.toString(8)}\0`
    const metaBytes = new TextEncoder().encode(metaInfo)

    // Combine: filename + null + metadata + null
    const fileInfoBytes = new Uint8Array(filenameBytes.length + 1 + metaBytes.length)
    fileInfoBytes.set(filenameBytes, 0)
    fileInfoBytes[filenameBytes.length] = 0  // null terminator after filename
    fileInfoBytes.set(metaBytes, filenameBytes.length + 1)

    const dataPacket = this.useCrc32
      ? encodeDataSubpacket32(fileInfoBytes, ZCRCW)
      : encodeDataSubpacket16(fileInfoBytes, ZCRCW)
    this.callbacks.onSend(dataPacket)

    this.state = SendState.WAIT_ZRPOS
  }

  private sendZDATA(position: number): void {
    this.log(`Sending ZDATA at position ${position}`)
    const header = this.useCrc32
      ? encodeBinaryHeader32(ZDATA, position)
      : encodeBinaryHeader16(ZDATA, position)
    this.callbacks.onSend(header)
  }

  private sendFileData(): void {
    const file = this.files[this.currentFileIndex]
    if (!file) return

    const total = file.data.length
    let lastProgressUpdate = this.currentPosition

    this.log(`Sending file data from position ${this.currentPosition}`)
    this.sendZDATA(this.currentPosition)

    // Initial progress update
    this.callbacks.onProgress?.(this.currentPosition, total)

    // Send data in chunks asynchronously to allow UI updates
    const sendNextChunk = () => {
      // Send multiple subpackets per frame for performance
      const chunksPerFrame = 128  // ~1MB per frame
      let chunksSent = 0

      while (this.currentPosition < total && chunksSent < chunksPerFrame) {
        const remaining = total - this.currentPosition
        const chunkSize = Math.min(SUBPACKET_SIZE, remaining)
        const chunk = file.data.slice(this.currentPosition, this.currentPosition + chunkSize)

        const isLast = this.currentPosition + chunkSize >= total
        const frameEnd = isLast ? ZCRCE : ZCRCG

        const packet = this.useCrc32
          ? encodeDataSubpacket32(chunk, frameEnd)
          : encodeDataSubpacket16(chunk, frameEnd)
        this.callbacks.onSend(packet)

        this.currentPosition += chunkSize
        chunksSent++

        if (isLast) break
      }

      // Update progress
      if (this.currentPosition - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL || this.currentPosition >= total) {
        this.callbacks.onProgress?.(this.currentPosition, total)
        lastProgressUpdate = this.currentPosition
      }

      // Continue or finish
      if (this.currentPosition < total) {
        // Use setTimeout to yield to event loop and allow UI updates
        setTimeout(sendNextChunk, 0)
      } else {
        this.sendZEOF()
      }
    }

    // Start sending
    sendNextChunk()
  }

  private sendZEOF(): void {
    const file = this.files[this.currentFileIndex]
    const position = file ? file.data.length : 0

    this.log(`Sending ZEOF at position ${position}`)
    const header = this.useCrc32
      ? encodeBinaryHeader32(ZEOF, position)
      : encodeBinaryHeader16(ZEOF, position)
    this.callbacks.onSend(header)

    // File complete - notify and move to next file
    this.callbacks.onFileComplete?.(file?.name || '')
    this.currentFileIndex++
    this.currentPosition = 0

    this.state = SendState.WAIT_ZRINIT
  }

  private sendZFIN(): void {
    this.log('Sending ZFIN')
    const header = encodeHexHeader(ZFIN, 0)
    this.callbacks.onSend(header)
    this.state = SendState.WAIT_ZFIN_ACK
  }

  private handleHeader(header: ZmodemHeader): void {
    this.log(`Received header: ${header.typeName} position=${header.position} crcOk=${header.crcOk}`)

    if (!header.crcOk) {
      this.log('CRC error in header')
      return
    }

    switch (header.type) {
      case ZRINIT:
        this.receiverFlags = header.flags[ZF0]
        this.useCrc32 = (this.receiverFlags & CANFC32) !== 0
        this.log(`Got ZRINIT, flags=0x${this.receiverFlags.toString(16)}, useCrc32=${this.useCrc32}`)

        if (this.state === SendState.WAIT_ZRINIT) {
          // Check if there are more files to send
          if (this.currentFileIndex < this.files.length) {
            this.sendZFILE()
          } else {
            // No more files, send ZFIN
            this.sendZFIN()
          }
        }
        break

      case ZRPOS:
        this.log(`Got ZRPOS at position ${header.position}`)
        this.currentPosition = header.position
        this.state = SendState.SENDING_DATA
        this.sendFileData()
        break

      case ZACK:
        this.log(`Got ZACK at position ${header.position}`)
        if (this.state === SendState.WAIT_ZRINIT) {
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
        this.log(`Got ZNAK at position ${header.position}`)
        // ZNAK means receiver didn't get the data properly
        // If position is invalid (larger than file size), reset to 0
        const file = this.files[this.currentFileIndex]
        if (file && header.position < file.data.length) {
          this.currentPosition = header.position
        } else {
          this.log(`Invalid position, resetting to 0`)
          this.currentPosition = 0
        }
        // Go back to WAIT_ZRPOS state and resend ZFILE
        this.state = SendState.WAIT_ZRINIT
        this.sendZFILE()
        break

      case ZFIN:
        this.log('Got ZFIN, sending OO')
        const oo = new Uint8Array([0x4f, 0x4f])
        this.callbacks.onSend(oo)
        this.state = SendState.COMPLETE
        this.callbacks.onSessionComplete?.()
        break

      default:
        this.log(`Unhandled header type: ${header.typeName}`)
    }
  }

  private handleData(data: ZmodemData): void {
    this.log(`Unexpected data received: ${data.data.length} bytes`)
  }

  private handleCancel(): void {
    this.log('Transfer cancelled by receiver')
    this.callbacks.onError?.('Transfer cancelled by receiver')
    this.state = SendState.IDLE
  }
}
