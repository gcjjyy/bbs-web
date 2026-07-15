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
  // Tail of the previous buffer, kept so trigger patterns split across
  // TCP packets are still detected
  zmodemDetectTail?: string
  // Consecutive CAN bytes seen so far (survives packet boundaries)
  zmodemCanCount?: number
  bbsDisconnected?: boolean
}

// EUC-KR block character replacement mapping
export interface BlockReplacement {
  from: [number, number]
  escCode: string
}
