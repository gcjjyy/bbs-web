/**
 * ZMODEM Protocol Implementation
 * TypeScript port referencing npm zmodem.js and lrzsz
 */

// Constants
export * from './constants.js'

// CRC calculations
export { crc16, crc16Update, crc16Finish, crc32, crc32Update, crc32Finish } from './crc.js'

// Encoding
export {
  encodeHexHeader,
  encodeBinaryHeader16,
  encodeBinaryHeader32,
  encodeBinaryHeaderWithFlags,
  encodeDataSubpacket16,
  encodeDataSubpacket32,
  encodeCancelSequence
} from './encode.js'

// Decoding
export { ZmodemParser, detectZmodem } from './decode.js'
export type { ZmodemHeader, ZmodemData, ParserCallback } from './decode.js'

// Receive
export { ZmodemReceiver } from './receive.js'
export type { FileInfo, ReceiveCallbacks } from './receive.js'

// Send
export { ZmodemSender } from './send.js'
export type { FileToSend, SendCallbacks } from './send.js'
