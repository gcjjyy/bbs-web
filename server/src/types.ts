import type { Socket } from 'socket.io'
import type { Socket as NetSocket } from 'net'

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
  netSocket?: NetSocket
  tSocket?: TelnetSocketType

  // Browser ZMODEM pass-through state
  zmodemActive?: boolean
  bbsDisconnected?: boolean
}

// EUC-KR block character replacement mapping
export interface BlockReplacement {
  from: [number, number]
  escCode: string
}
