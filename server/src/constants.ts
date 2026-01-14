import type { BlockReplacement } from './types'

// BBS server configuration
export const BBS_ADDR = 'bbs.olddos.kr'
export const BBS_PORT = 9000

// Server configuration
export const SERVER_PORT = 8199
export const SERVER_HOST = '0.0.0.0'

// File upload limits
export const MAX_FILE_SIZE = 512 * 1024 * 1024 // 512MB

// ZMODEM mode configuration
// When true, server passes through ZMODEM data and browser handles protocol
// When false, server spawns rz/sz processes to handle ZMODEM (legacy mode)
export const USE_BROWSER_ZMODEM = true

// Telnet protocol options
export const ECHO = 1
export const TERMINAL_TYPE = 24
export const WINDOW_SIZE = 31
export const WILL_OPTIONS = [ECHO, TERMINAL_TYPE, WINDOW_SIZE]

// EUC-KR special block characters mapping
// These non-standard characters are replaced with custom escape sequences
// that survive iconv decoding and can be handled on the client side
// Format: { from: [hi, lo], escCode: 'XXX' } -> becomes ESC[=XXXB
export const EUC_KR_BLOCK_REPLACEMENTS: BlockReplacement[] = [
  // 0xADFC -> Full Block (fills entire 16x16 cell)
  { from: [0xAD, 0xFC], escCode: '901' },
  // 0xADFD -> Lower Half Block
  { from: [0xAD, 0xFD], escCode: '903' },
  // 0xAEA2 -> Upper Half Block
  { from: [0xAE, 0xA2], escCode: '902' }
]

// ZMODEM detection patterns
export const RZ_DETECT_PATTERN = /B00000000000000/
export const SZ_DETECT_PATTERN = /B0100/
export const ZMODEM_PROTOCOL_PROMPT = /송신 프로토콜\(1:Xmodem, 2:Ymodem, 3:Zmodem\):/

// ZMODEM progress parsing patterns
export const RZ_FILENAME_PATTERN = /Receiving: (.*)/
export const RZ_PROGRESS_PATTERN = /Bytes received: ([0-9 ]*)\/([0-9 ]*).*BPS:([0-9 ]*)/gi
export const SZ_FILENAME_PATTERN = /Sending: (.*)/
export const SZ_PROGRESS_PATTERN = /Bytes Sent:\s*([0-9]+)\s*\/\s*([0-9]+).*BPS:\s*([0-9]+)/gi

// Abort packet for canceling ZMODEM transfer
export const ZMODEM_ABORT_PACKET = Buffer.from([
  24, 24, 24, 24, 24, 24, 24, 24, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 0
])
