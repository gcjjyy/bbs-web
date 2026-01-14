import { spawn, type Subprocess } from 'bun'
import { v1 as uuidv1 } from 'uuid'
import * as fs from 'fs'
import * as iconv from 'iconv-lite'
import {
  RZ_DETECT_PATTERN,
  SZ_DETECT_PATTERN,
  ZMODEM_PROTOCOL_PROMPT,
  RZ_FILENAME_PATTERN,
  RZ_PROGRESS_PATTERN,
  SZ_FILENAME_PATTERN,
  SZ_PROGRESS_PATTERN,
  ZMODEM_ABORT_PACKET,
  USE_BROWSER_ZMODEM
} from './constants'
import { preprocessBlockChars } from './telnet'
import type { ExtendedSocket } from './types'

// Helper type for spawn with pipe IO
type SpawnedProc = Subprocess<'pipe', 'pipe', 'pipe'>

const fileCacheDir = import.meta.dir + '/../../frontend/build/file-cache/'

/**
 * Handle incoming data from BBS and check for ZMODEM triggers
 */
export function handleBBSData(
  ioSocket: ExtendedSocket,
  buffer: Buffer
): void {
  // Browser ZMODEM mode: pass through all data directly
  if (USE_BROWSER_ZMODEM) {
    handlePassThrough(ioSocket, buffer)
    return
  }

  // Legacy server-side ZMODEM mode:
  // If currently in rz (download) mode, pipe data to rz process
  if (ioSocket.rzTransmit && ioSocket.rz) {
    const proc = ioSocket.rz as SpawnedProc
    proc.stdin.write(buffer)
    return
  }

  // If currently in sz (upload) mode, pipe data to sz process
  if (ioSocket.szTransmit && ioSocket.sz) {
    const proc = ioSocket.sz as SpawnedProc
    proc.stdin.write(buffer)
    return
  }

  // Normal mode: preprocess and decode data
  const processedBuffer = preprocessBlockChars(buffer)
  ioSocket.tSocket.decodeStream.write(processedBuffer)

  // Check for rz (download) trigger
  checkRzTrigger(ioSocket, buffer)

  // Check for sz (upload) trigger
  checkSzTrigger(ioSocket, buffer)

  // Auto-select Zmodem protocol
  autoSelectZmodem(ioSocket, buffer)
}

/**
 * Pass-through mode for browser ZMODEM
 * Forwards data between browser and BBS, switching to raw mode during ZMODEM transfers
 */
function handlePassThrough(
  ioSocket: ExtendedSocket,
  buffer: Buffer
): void {
  // If already in ZMODEM mode, send raw data directly to browser
  if (ioSocket.zmodemActive) {
    ioSocket.emit('data', buffer)

    // Check for ZMODEM session end (ZFIN followed by OO)
    // ZFIN hex header pattern: **ZDLE B 08 (type 8 = ZFIN)
    const bufStr = buffer.toString('latin1')
    if (bufStr.includes('B08') || bufStr.includes('OO')) {
      // Potential end of session, but let browser confirm
      // Check for cancel sequence too
      let canCount = 0
      for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] === 0x18) canCount++
        else canCount = 0
        if (canCount >= 5) {
          console.log('[ZMODEM] Cancel detected, exiting ZMODEM mode')
          ioSocket.zmodemActive = false
          break
        }
      }
    }
    return
  }

  // Check for ZMODEM start trigger
  const bufStr = buffer.toString('latin1')

  // Download trigger: ZRQINIT (sender wants to send file to us)
  if (RZ_DETECT_PATTERN.test(bufStr)) {
    console.log('[ZMODEM] Download trigger detected, switching to raw mode')
    ioSocket.zmodemActive = true
    ioSocket.emit('data', buffer)
    return
  }

  // Upload trigger: ZRINIT (receiver ready to receive file from us)
  if (SZ_DETECT_PATTERN.test(bufStr)) {
    console.log('[ZMODEM] Upload trigger detected, switching to raw mode')
    ioSocket.zmodemActive = true
    ioSocket.emit('data', buffer)
    return
  }

  // Normal text data: preprocess block chars and decode
  const processedBuffer = preprocessBlockChars(buffer)
  ioSocket.tSocket.decodeStream.write(processedBuffer)

  // Auto-select Zmodem protocol
  autoSelectZmodem(ioSocket, buffer)
}

/**
 * Check for rz (download) trigger pattern and start download
 */
function checkRzTrigger(ioSocket: ExtendedSocket, buffer: Buffer): void {
  const result = RZ_DETECT_PATTERN.exec(buffer.toString())
  if (!result) return

  // Create temporary directory for file download
  ioSocket.rzTargetDir = uuidv1()
  fs.mkdirSync(fileCacheDir + ioSocket.rzTargetDir, { recursive: true })

  ioSocket.rzTransmit = true

  // Spawn rz process
  ioSocket.rz = spawn({
    cmd: ['rz', '-e', '-E', '-vv'],
    cwd: fileCacheDir + ioSocket.rzTargetDir,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe'
  })

  const proc = ioSocket.rz as SpawnedProc

  // Handle rz stdout (send to BBS)
  const readStdout = async () => {
    const reader = proc.stdout.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        ioSocket.tSocket.write(Buffer.from(value))
      }
    } catch {
      // Process ended
    }
  }
  readStdout()

  // Handle rz stderr (parse progress)
  const readStderr = async () => {
    const reader = proc.stderr.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const decodedString = iconv.decode(Buffer.from(value), 'cp949')

        // Check for filename
        const filenameMatch = RZ_FILENAME_PATTERN.exec(decodedString)
        if (filenameMatch) {
          ioSocket.rzFilename = filenameMatch[1]
          ioSocket.emit('rz-begin', { filename: ioSocket.rzFilename })
        }

        // Check for progress - need fresh regex for each iteration
        const progressPattern = new RegExp(RZ_PROGRESS_PATTERN.source, 'gi')
        let progressMatch
        while ((progressMatch = progressPattern.exec(decodedString))) {
          const received = parseInt(progressMatch[1]!.trim(), 10)
          const total = parseInt(progressMatch[2]!.trim(), 10)
          const bps = parseInt(progressMatch[3]!.trim(), 10)
          ioSocket.emit('rz-progress', { received, total, bps })
        }
      }
    } catch {
      // Process ended
    }
  }
  readStderr()

  // Handle rz process exit
  ioSocket.rz.exited.then((code) => {
    ioSocket.rzTransmit = false

    // Move downloaded file to proper filename
    try {
      const dir = fileCacheDir + ioSocket.rzTargetDir
      const files = fs.readdirSync(dir)
      if (files.length > 0 && ioSocket.rzFilename) {
        const oldPath = `${dir}/${files[0]}`
        const newPath = `${dir}/${ioSocket.rzFilename}`
        if (oldPath !== newPath) {
          fs.renameSync(oldPath, newPath)
        }
      }
    } catch {
      // Ignore file move errors
    }

    const url = '/file-cache/' + ioSocket.rzTargetDir + '/' + ioSocket.rzFilename
    ioSocket.emit('rz-end', { code, url })
  })
}

/**
 * Check for sz (upload) trigger pattern
 */
function checkSzTrigger(ioSocket: ExtendedSocket, buffer: Buffer): void {
  const result = SZ_DETECT_PATTERN.exec(buffer.toString())
  if (!result) return

  // Only send sz-request if not already waiting for file selection
  if (!ioSocket.szWaiting) {
    ioSocket.szWaiting = true
    ioSocket.emit('sz-request', {})
  }
}

/**
 * Auto-select Zmodem protocol when BBS prompts for protocol selection
 */
function autoSelectZmodem(ioSocket: ExtendedSocket, buffer: Buffer): void {
  const bufferStr = iconv.decode(buffer, 'cp949')
  const result = ZMODEM_PROTOCOL_PROMPT.exec(bufferStr)

  if (result) {
    const encoded = iconv.encode('3\r\n', 'cp949')
    ioSocket.tSocket.write(encoded)
  }
}

/**
 * Start sz (upload) process
 */
export function startSzUpload(
  ioSocket: ExtendedSocket,
  data: { szFilename: string; szTargetDir: string }
): void {
  if (!ioSocket.szWaiting) return

  ioSocket.szWaiting = false
  ioSocket.szTransmit = true

  // Spawn sz process
  ioSocket.sz = spawn({
    cmd: ['sz', data.szFilename, '-e', '-E', '-vv'],
    cwd: fileCacheDir + data.szTargetDir,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe'
  })

  const proc = ioSocket.sz as SpawnedProc

  // Handle sz stdout (send to BBS)
  const readStdout = async () => {
    const reader = proc.stdout.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        ioSocket.tSocket.write(Buffer.from(value))
      }
    } catch {
      // Process ended
    }
  }
  readStdout()

  // Handle sz stderr (parse progress)
  const readStderr = async () => {
    const reader = proc.stderr.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const decodedString = Buffer.from(value).toString()

        // Check for filename
        const filenameMatch = SZ_FILENAME_PATTERN.exec(decodedString)
        if (filenameMatch) {
          ioSocket.emit('sz-begin', { filename: data.szFilename })
        }

        // Check for progress - need fresh regex for each iteration
        const progressPattern = new RegExp(SZ_PROGRESS_PATTERN.source, 'gi')
        let progressMatch
        while ((progressMatch = progressPattern.exec(decodedString))) {
          const sent = parseInt(progressMatch[1]!, 10)
          const total = parseInt(progressMatch[2]!, 10)
          const bps = parseInt(progressMatch[3]!, 10)
          ioSocket.emit('sz-progress', { sent, total, bps })
        }
      }
    } catch {
      // Process ended
    }
  }
  readStderr()

  // Handle sz process exit
  ioSocket.sz.exited.then((code) => {
    ioSocket.szTransmit = false
    ioSocket.emit('sz-end', { code })
  })
}

/**
 * Cancel sz (upload) and send abort packet to BBS
 */
export function cancelSzUpload(ioSocket: ExtendedSocket): void {
  if (ioSocket.szWaiting) {
    ioSocket.szWaiting = false
    ioSocket.netSocket.write(ZMODEM_ABORT_PACKET)
  }
}

/**
 * Get the file cache directory
 */
export function getFileCacheDir(): string {
  return fileCacheDir
}
