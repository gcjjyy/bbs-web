import * as net from 'net'
import * as iconv from 'iconv-lite'
import { TelnetSocket } from 'telnet-stream'
import {
  BBS_ADDR,
  BBS_PORT,
  WILL_OPTIONS,
  TERMINAL_TYPE,
  EUC_KR_BLOCK_REPLACEMENTS
} from './constants'
import type { ExtendedSocket, TelnetSocketType } from './types'

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
  // Create client TCP Socket
  ioSocket.netSocket = net.createConnection(BBS_PORT, BBS_ADDR)

  // Create Telnet Protocol Stream
  const telnetSocket = new TelnetSocket(ioSocket.netSocket)
  ioSocket.tSocket = telnetSocket as unknown as TelnetSocketType

  // Generate the decode stream
  const decodeStream = iconv.decodeStream('cp949')
  ioSocket.tSocket.decodeStream = decodeStream as unknown as NodeJS.WritableStream
  decodeStream.on('data', (data: Buffer) => {
    ioSocket.emit('data', Buffer.from(data))
  })

  // Handle telnet protocol negotiation
  ioSocket.tSocket.on('do', (opt: unknown) => {
    const option = opt as number
    if (WILL_OPTIONS.includes(option)) {
      ioSocket.tSocket.writeWill(option)

      if (option === TERMINAL_TYPE) {
        ioSocket.tSocket.writeSub(TERMINAL_TYPE, Buffer.from('VT100'))
      }
    } else {
      ioSocket.tSocket.writeWont(option)
    }
  })

  // Handle BBS disconnection
  ioSocket.tSocket.on('close', () => {
    console.log('BBS disconnected:', ioSocket.client.conn.remoteAddress)
    ioSocket.disconnect(true)
  })
}

/**
 * Send data to BBS (encode to EUC-KR for text, raw for binary)
 */
export function sendToBBS(ioSocket: ExtendedSocket, data: string | Buffer | Uint8Array): void {
  // If ZMODEM session is active, send all data raw (no encoding)
  if (ioSocket.zmodemActive) {
    const buf = Buffer.from(data instanceof Uint8Array ? data : data as Buffer)
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
