import type { Socket } from 'socket.io'
import type { Socket as NetSocket } from 'net'
import type { Subprocess } from 'bun'

// TelnetSocket type (telnet-stream doesn't have proper types)
export interface TelnetSocketType {
  write: (data: Buffer | string) => void
  writeWill: (option: number) => void
  writeWont: (option: number) => void
  writeSub: (option: number, data: Buffer) => void
  on: (event: string, handler: (...args: unknown[]) => void) => void
  decodeStream: NodeJS.WritableStream
}

// Extended Socket.IO socket with BBS-specific properties
export interface ExtendedSocket extends Socket {
  // Network connections
  netSocket: NetSocket
  tSocket: TelnetSocketType

  // Browser ZMODEM pass-through state
  zmodemActive?: boolean

  // ZMODEM receive (download) state
  rz?: Subprocess
  rzTransmit?: boolean
  rzFilename?: string
  rzTargetDir?: string

  // ZMODEM send (upload) state
  sz?: Subprocess
  szTransmit?: boolean
  szWaiting?: boolean
  szTargetDir?: string
}

// EUC-KR block character replacement mapping
export interface BlockReplacement {
  from: [number, number]
  escCode: string
}

// ZMODEM progress data
export interface ZmodemProgress {
  received?: number
  sent?: number
  total: number
  bps: number
}

// Upload response
export interface UploadResponse {
  result: boolean
  szTargetDir?: string
  szFilename?: string
  error?: string
}

// Upload progress event data
export interface UploadProgressData {
  loaded: number
  total: number
}
