/**
 * ZMODEM Protocol Implementation
 * TypeScript port referencing npm zmodem.js and lrzsz
 */

// Constants
export * from './constants'

// CRC calculations
export { crc16, crc16Update, crc16Finish, crc32, crc32Update, crc32Finish } from './crc'

// Encoding
export {
  encodeHexHeader,
  encodeBinaryHeader16,
  encodeBinaryHeader32,
  encodeBinaryHeaderWithFlags,
  encodeDataSubpacket16,
  encodeDataSubpacket32,
  encodeCancelSequence
} from './encode'

// Decoding
export { ZmodemParser, detectZmodem } from './decode'
export type { ZmodemHeader, ZmodemData, ParserCallback } from './decode'

// Receive
export { ZmodemReceiver } from './receive'
export type { FileInfo, ReceiveCallbacks } from './receive'

// Send
export { ZmodemSender } from './send'
export type { FileToSend, SendCallbacks } from './send'
