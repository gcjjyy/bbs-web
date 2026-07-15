import type { BlockReplacement } from './types'
import { envString, envInt } from './env'

// BBS server configuration (override with BBS_ADDR/BBS_PORT env vars)
export const BBS_ADDR = envString('BBS_ADDR', 'bbsweb.oscc.kr')
export const BBS_PORT = envInt('BBS_PORT', 9000)

// Server configuration (override with SERVER_PORT/SERVER_HOST env vars)
export const SERVER_PORT = envInt('SERVER_PORT', 8199)
export const SERVER_HOST = envString('SERVER_HOST', '0.0.0.0')

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

// ZMODEM detection patterns (for browser pass-through mode)
export const RZ_DETECT_PATTERN = /B00000000000000/
export const SZ_DETECT_PATTERN = /B0100/
export const ZMODEM_PROTOCOL_PROMPT = /송신 프로토콜\(1:Xmodem, 2:Ymodem, 3:Zmodem\):/

// ZMODEM chunk size for progress updates (8KB chunks for smooth progress)
export const ZMODEM_CHUNK_SIZE = 8 * 1024
