import {
  RZ_DETECT_PATTERN,
  SZ_DETECT_PATTERN,
  ZMODEM_PROTOCOL_PROMPT,
  ZMODEM_CHUNK_SIZE
} from './constants'
import { preprocessBlockChars } from './telnet'
import type { ExtendedSocket } from './types'
import * as iconv from 'iconv-lite'

// Longest trigger pattern is 15 chars, so 14 tail chars are enough to
// complete a pattern split across two packets
const DETECT_TAIL_LENGTH = 14

function activateZmodem(ioSocket: ExtendedSocket, buffer: Buffer): void {
  ioSocket.zmodemActive = true
  ioSocket.zmodemDetectTail = ''
  ioSocket.zmodemCanCount = 0
  ioSocket.emit('data', buffer)
}

/**
 * Handle incoming data from BBS - browser ZMODEM pass-through mode
 * Forwards data between browser and BBS, switching to raw mode during ZMODEM transfers
 */
export function handleBBSData(
  ioSocket: ExtendedSocket,
  buffer: Buffer
): void {
  // If already in ZMODEM mode, send raw data directly to browser in chunks
  if (ioSocket.zmodemActive) {
    // Text buffered before the session is no longer relevant
    ioSocket.zmodemDetectTail = ''

    // Send data in chunks for smoother progress updates
    for (let offset = 0; offset < buffer.length; offset += ZMODEM_CHUNK_SIZE) {
      const chunk = buffer.subarray(offset, offset + ZMODEM_CHUNK_SIZE)
      ioSocket.emit('data', chunk)
    }

    let canCount = ioSocket.zmodemCanCount ?? 0
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] === 0x18) canCount++
      else canCount = 0
      if (canCount >= 5) {
        console.log('[ZMODEM] Cancel detected, exiting ZMODEM mode')
        ioSocket.zmodemActive = false
        canCount = 0
        break
      }
    }
    ioSocket.zmodemCanCount = canCount
    return
  }

  // Check for ZMODEM start trigger, joining the previous packet's tail
  // so patterns split across packets are still detected
  const bufStr = (ioSocket.zmodemDetectTail ?? '') + buffer.toString('latin1')

  // Download trigger: ZRQINIT (sender wants to send file to us)
  if (RZ_DETECT_PATTERN.test(bufStr)) {
    console.log('[ZMODEM] Download trigger detected, switching to raw mode')
    activateZmodem(ioSocket, buffer)
    return
  }

  // Upload trigger: ZRINIT (receiver ready to receive file from us)
  if (SZ_DETECT_PATTERN.test(bufStr)) {
    console.log('[ZMODEM] Upload trigger detected, switching to raw mode')
    activateZmodem(ioSocket, buffer)
    return
  }

  ioSocket.zmodemDetectTail = bufStr.slice(-DETECT_TAIL_LENGTH)

  // Normal text data: preprocess block chars and decode
  const processedBuffer = preprocessBlockChars(buffer)
  ioSocket.tSocket?.decodeStream.write(processedBuffer)

  // Auto-select Zmodem protocol
  autoSelectZmodem(ioSocket, buffer)
}

/**
 * Auto-select Zmodem protocol when BBS prompts for protocol selection
 */
function autoSelectZmodem(ioSocket: ExtendedSocket, buffer: Buffer): void {
  if (!ioSocket.tSocket) {
    return
  }

  const bufferStr = iconv.decode(buffer, 'cp949')
  const result = ZMODEM_PROTOCOL_PROMPT.exec(bufferStr)

  if (result) {
    const encoded = iconv.encode('3\r\n', 'cp949')
    ioSocket.tSocket.write(encoded)
  }
}
