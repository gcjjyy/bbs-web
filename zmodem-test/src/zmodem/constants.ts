/**
 * ZMODEM Protocol Constants
 * Reference: lrzsz source code and zmodem.js
 */

// Frame indicators
export const ZPAD = 0x2a  // '*' - Padding character
export const ZDLE = 0x18  // Ctrl-X - Escape character
export const ZDLEE = 0x58 // Escaped ZDLE (ZDLE ^ 0x40)

// Frame types
export const ZBIN = 0x41   // 'A' - Binary header with 16-bit CRC
export const ZHEX = 0x42   // 'B' - Hex header with 16-bit CRC
export const ZBIN32 = 0x43 // 'C' - Binary header with 32-bit CRC

// Frame type codes
export const ZRQINIT = 0   // Request receive init
export const ZRINIT = 1    // Receive init
export const ZSINIT = 2    // Send init sequence
export const ZACK = 3      // ACK
export const ZFILE = 4     // File name/info
export const ZSKIP = 5     // Skip this file
export const ZNAK = 6      // Last packet bad, please NAK
export const ZABORT = 7    // Abort batch transfers
export const ZFIN = 8      // Finish session
export const ZRPOS = 9     // Resume file at position
export const ZDATA = 10    // Data packet follows
export const ZEOF = 11     // End of file
export const ZFERR = 12    // Fatal read/write error
export const ZCRC = 13     // Request for file CRC
export const ZCHALLENGE = 14 // Receiver's challenge
export const ZCOMPL = 15   // Request is complete
export const ZCAN = 16     // Other end cancelled with CAN-CAN-CAN-CAN-CAN
export const ZFREECNT = 17 // Request for free bytes on filesystem
export const ZCOMMAND = 18 // Command from sender
export const ZSTDERR = 19  // Output to stderr

// Data subpacket terminators
export const ZCRCE = 0x68 // 'h' - CRC next, frame ends, header follows
export const ZCRCG = 0x69 // 'i' - CRC next, frame continues nonstop
export const ZCRCQ = 0x6a // 'j' - CRC next, frame continues, ZACK expected
export const ZCRCW = 0x6b // 'k' - CRC next, frame ends, ZACK expected

// Special escape sequences
export const ZRUB0 = 0x6c // 'l' - Escaped 0x7f (DEL)
export const ZRUB1 = 0x6d // 'm' - Escaped 0xff

// ZRINIT flags (ZF0)
export const CANFDX = 0x01   // Full duplex
export const CANOVIO = 0x02  // Can receive during disk I/O
export const CANBRK = 0x04   // Can send break
export const CANCRY = 0x08   // Can decrypt
export const CANLZW = 0x10   // Can uncompress
export const CANFC32 = 0x20  // Can use 32-bit CRC
export const ESCCTL = 0x40   // Receiver expects ctl chars escaped
export const ESC8 = 0x80     // Receiver expects 8th bit escaped

// ZFILE flags (ZF0) - Conversion options
export const ZCBIN = 1    // Binary transfer
export const ZCNL = 2     // Convert NL to local convention
export const ZCRESUM = 3  // Resume interrupted file

// ZFILE flags (ZF1) - Management options
export const ZMNEWL = 1   // Transfer if source newer or longer
export const ZMCRC = 2    // Transfer if CRCs differ
export const ZMAPND = 3   // Append to existing file
export const ZMCLOB = 4   // Replace existing file
export const ZMNEW = 5    // Transfer if source newer
export const ZMDIFF = 6   // Transfer if dates or lengths different
export const ZMPROT = 7   // Protect destination file

// Header position byte indices
export const ZF0 = 3
export const ZF1 = 2
export const ZF2 = 1
export const ZF3 = 0
export const ZP0 = 0
export const ZP1 = 1
export const ZP2 = 2
export const ZP3 = 3

// Control characters that need escaping
export const XON = 0x11
export const XOFF = 0x13
export const DLE = 0x10
export const CR = 0x0d

// Cancel sequence
export const CAN = 0x18

// Frame type names for debugging
export const FRAME_NAMES: Record<number, string> = {
  [ZRQINIT]: 'ZRQINIT',
  [ZRINIT]: 'ZRINIT',
  [ZSINIT]: 'ZSINIT',
  [ZACK]: 'ZACK',
  [ZFILE]: 'ZFILE',
  [ZSKIP]: 'ZSKIP',
  [ZNAK]: 'ZNAK',
  [ZABORT]: 'ZABORT',
  [ZFIN]: 'ZFIN',
  [ZRPOS]: 'ZRPOS',
  [ZDATA]: 'ZDATA',
  [ZEOF]: 'ZEOF',
  [ZFERR]: 'ZFERR',
  [ZCRC]: 'ZCRC',
  [ZCHALLENGE]: 'ZCHALLENGE',
  [ZCOMPL]: 'ZCOMPL',
  [ZCAN]: 'ZCAN',
  [ZFREECNT]: 'ZFREECNT',
  [ZCOMMAND]: 'ZCOMMAND',
  [ZSTDERR]: 'ZSTDERR'
}
