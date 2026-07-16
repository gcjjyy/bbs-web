import * as net from 'net'
import * as iconv from 'iconv-lite'
import { TelnetSocket } from 'telnet-stream'
import {
  BBS_ADDR,
  BBS_PORT,
  WILL_OPTIONS,
  TERMINAL_TYPE,
  TERMINAL_TYPE_IS,
  TERMINAL_TYPE_SEND,
  TERMINAL_NAME,
  TERMINAL_COLUMNS,
  TERMINAL_ROWS,
  WINDOW_SIZE,
  EUC_KR_BLOCK_REPLACEMENTS
} from './constants'
import type { ExtendedSocket, TelnetSocketType } from './types'

const log = (msg: string) => console.log(msg)

type TelnetNegotiationSocket = Pick<
  TelnetSocketType,
  'writeWill' | 'writeWont' | 'writeSub'
>

export function handleTelnetDo(
  tSocket: TelnetNegotiationSocket,
  option: number
): void {
  if (!WILL_OPTIONS.includes(option)) {
    tSocket.writeWont(option)
    return
  }

  tSocket.writeWill(option)

  if (option === WINDOW_SIZE) {
    const windowSize = Buffer.alloc(4)
    windowSize.writeUInt16BE(TERMINAL_COLUMNS, 0)
    windowSize.writeUInt16BE(TERMINAL_ROWS, 2)
    tSocket.writeSub(WINDOW_SIZE, windowSize)
  }
}

export function handleTelnetSub(
  tSocket: TelnetNegotiationSocket,
  option: number,
  data: Buffer
): void {
  if (option !== TERMINAL_TYPE || data[0] !== TERMINAL_TYPE_SEND) {
    return
  }

  const terminalType = Buffer.concat([
    Buffer.from([TERMINAL_TYPE_IS]),
    Buffer.from(TERMINAL_NAME, 'ascii')
  ])
  tSocket.writeSub(TERMINAL_TYPE, terminalType)
}

function closeBBSConnection(ioSocket: ExtendedSocket, reason: string): void {
  if (ioSocket.bbsDisconnected) {
    return
  }

  ioSocket.bbsDisconnected = true
  log(`BBS connection closed: ${reason} (${ioSocket.client.conn.remoteAddress})`)
  ioSocket.emit('bbs-error', { message: reason })

  if (ioSocket.netSocket && !ioSocket.netSocket.destroyed) {
    ioSocket.netSocket.destroy()
  }

  if (ioSocket.connected) {
    ioSocket.disconnect(true)
  }
}

/**
 * Preprocess buffer to replace special EUC-KR block characters
 * Replaces with: ESC [ = XXX B (e.g., \x1b[=901B)
 * This is ASCII, survives iconv, and can be detected by client's applyEscape()
 */
export function preprocessBlockChars(buffer: Buffer): Buffer {
  const result: number[] = []
  let i = 0

  while (i < buffer.length) {
    let replaced = false

    // Check for 2-byte EUC-KR sequences
    if (i + 1 < buffer.length) {
      for (const { from, escCode } of EUC_KR_BLOCK_REPLACEMENTS) {
        if (buffer[i] === from[0] && buffer[i + 1] === from[1]) {
          // Insert escape sequence: ESC [ = XXX B
          const seq = `\x1b[=${escCode}B`
          for (const c of seq) {
            result.push(c.charCodeAt(0))
          }
          i += 2
          replaced = true
          break
        }
      }
    }

    if (!replaced) {
      result.push(buffer[i]!)
      i++
    }
  }

  return Buffer.from(result)
}

/**
 * Create and configure a telnet connection to the BBS server
 */
export function createTelnetConnection(ioSocket: ExtendedSocket): void {
  ioSocket.bbsDisconnected = false

  const netSocket = net.createConnection(BBS_PORT, BBS_ADDR)
  ioSocket.netSocket = netSocket

  netSocket.on('error', (error) => {
    closeBBSConnection(ioSocket, error.message)
  })

  netSocket.on('timeout', () => {
    closeBBSConnection(ioSocket, 'BBS connection timed out')
  })

  netSocket.on('close', (hadError) => {
    if (hadError) {
      return
    }

    closeBBSConnection(ioSocket, 'BBS disconnected')
  })

  // Create Telnet Protocol Stream
  const telnetSocket = new TelnetSocket(netSocket)
  ioSocket.tSocket = telnetSocket as unknown as TelnetSocketType

  // Generate the decode stream
  const decodeStream = iconv.decodeStream('cp949')
  ioSocket.tSocket.decodeStream = decodeStream as unknown as NodeJS.WritableStream
  decodeStream.on('error', (error: Error) => {
    closeBBSConnection(ioSocket, error.message)
  })
  decodeStream.on('data', (data: Buffer) => {
    ioSocket.emit('data', Buffer.from(data))
  })

  // Handle telnet protocol negotiation
  ioSocket.tSocket.on('do', (opt: unknown) => {
    const option = opt as number
    const { tSocket } = ioSocket
    if (!tSocket) {
      return
    }

    handleTelnetDo(tSocket, option)
  })

  ioSocket.tSocket.on('sub', (opt: unknown, data: unknown) => {
    const { tSocket } = ioSocket
    if (!tSocket || !Buffer.isBuffer(data)) {
      return
    }

    handleTelnetSub(tSocket, opt as number, data)
  })

  ioSocket.tSocket.on('error', (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    closeBBSConnection(ioSocket, message)
  })

  // Handle BBS disconnection
  ioSocket.tSocket.on('close', () => {
    closeBBSConnection(ioSocket, 'BBS disconnected')
  })
}

/**
 * Send data to BBS (encode to EUC-KR for text, raw for binary)
 */
export function sendToBBS(ioSocket: ExtendedSocket, data: string | Buffer | Uint8Array): void {
  if (!ioSocket.tSocket) {
    ioSocket.emit('bbs-error', { message: 'BBS connection is not available' })
    return
  }

  // If ZMODEM session is active, send all data raw (no encoding)
  if (ioSocket.zmodemActive) {
    const buf = typeof data === 'string'
      ? Buffer.from(data, 'binary')
      : Buffer.from(data)
    ioSocket.tSocket.write(buf)
    return
  }

  // Check if this is binary data (Uint8Array or Buffer with binary content)
  if (data instanceof Uint8Array || Buffer.isBuffer(data)) {
    // Check for ZMODEM binary markers (ZPAD=0x2a, ZDLE=0x18)
    const firstByte = data[0]
    if (firstByte === 0x2a || firstByte === 0x18) {
      // Binary ZMODEM data - send raw without encoding
      const buf = Buffer.from(data)
      ioSocket.tSocket.write(buf)
      return
    }
  }

  // Text data - encode to CP949
  const encoded = iconv.encode(Buffer.from(data).toString(), 'cp949')
  ioSocket.tSocket.write(encoded)
}

/**
 * Decode buffer from CP949
 */
export function decodeFromBBS(buffer: Buffer): string {
  return iconv.decode(buffer, 'cp949')
}
