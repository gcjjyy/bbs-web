/**
 * ZMODEM Send Test
 * Tests sending a file to lrzsz's rz command
 */

import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { ZmodemSender, type FileToSend } from '../src/zmodem/index.js'

// Test configuration
const TEST_FILE_SIZE = 200 * 1024 * 1024  // 200 MB
const OUTPUT_DIR = '/tmp/zmodem-test-receive'

// Create output directory
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

console.log('=== ZMODEM Send Test ===')
console.log(`Test file size: ${TEST_FILE_SIZE} bytes (${(TEST_FILE_SIZE / 1024 / 1024).toFixed(1)} MB)`)
console.log(`Output directory: ${OUTPUT_DIR}`)

// Generate test data
console.log('Generating test data...')
const testData = new Uint8Array(TEST_FILE_SIZE)
for (let i = 0; i < TEST_FILE_SIZE; i++) {
  testData[i] = i & 0xff
}

// Calculate hash of original data
const originalHash = crypto.createHash('md5').update(testData).digest('hex')
console.log(`Original data MD5: ${originalHash}`)

// File to send
const fileToSend: FileToSend = {
  name: 'test-send-200mb.bin',
  data: testData,
  mtime: Math.floor(Date.now() / 1000),
  mode: 0o644
}

// Spawn rz process
console.log('\nSpawning rz process...')
const rz = spawn('rz', ['-b', '-e', '-Z'], {
  cwd: OUTPUT_DIR,
  stdio: ['pipe', 'pipe', 'inherit']
})

let sender: ZmodemSender | null = null
let startTime = 0
let lastProgressTime = 0
let rzInitReceived = false

// Create sender
sender = new ZmodemSender({
  onSend: (data: Uint8Array) => {
    // console.log(`[SEND] Sending ${data.length} bytes to rz`)
    rz.stdin.write(Buffer.from(data))
  },

  onProgress: (sent: number, total: number) => {
    const now = Date.now()
    if (now - lastProgressTime > 500 || sent === total) {
      lastProgressTime = now
      const pct = ((sent / total) * 100).toFixed(1)
      const elapsed = (now - startTime) / 1000
      const speed = elapsed > 0 ? (sent / elapsed / 1024 / 1024).toFixed(2) : '0'
      process.stdout.write(`\rProgress: ${pct}% (${(sent / 1024 / 1024).toFixed(1)} / ${(total / 1024 / 1024).toFixed(1)} MB) - ${speed} MB/s`)
    }
  },

  onFileComplete: (name: string) => {
    console.log(`\nFile sent: ${name}`)
  },

  onSessionComplete: () => {
    console.log('\n\nSession complete!')

    // Give rz time to finish writing
    setTimeout(() => {
      // Verify received file
      const receivedPath = path.join(OUTPUT_DIR, fileToSend.name)
      if (fs.existsSync(receivedPath)) {
        const receivedData = fs.readFileSync(receivedPath)
        const receivedHash = crypto.createHash('md5').update(receivedData).digest('hex')

        console.log(`\nReceived file: ${receivedPath}`)
        console.log(`Received size: ${receivedData.length} bytes`)
        console.log(`Received MD5: ${receivedHash}`)

        if (receivedHash === originalHash) {
          console.log('\n*** SUCCESS: File received correctly! ***')
        } else {
          console.log('\n*** ERROR: Hash mismatch! ***')
        }

        // Cleanup
        fs.unlinkSync(receivedPath)
      } else {
        console.log('\n*** ERROR: Received file not found! ***')
      }

      process.exit(0)
    }, 1000)
  },

  onError: (error: string) => {
    console.error(`\n[ERROR] ${error}`)
    process.exit(1)
  }
})

sender.setDebug(false)

// Handle data from rz
rz.stdout.on('data', (data: Buffer) => {
  const bytes = new Uint8Array(data)

  // Look for ZRINIT pattern to know rz is ready
  const text = data.toString('latin1')
  if (!rzInitReceived && text.includes('B0100')) {
    console.log('rz is ready (ZRINIT received)')
    rzInitReceived = true
    startTime = Date.now()
  }

  if (sender) {
    sender.processData(bytes)
  }
})

rz.on('close', (code) => {
  console.log(`\nrz process exited with code ${code}`)
})

rz.on('error', (err) => {
  console.error(`rz process error: ${err.message}`)
  process.exit(1)
})

// Start sending after a short delay to let rz initialize
setTimeout(() => {
  console.log('Starting file transfer...')
  sender?.start([fileToSend])
}, 500)

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\nCancelling...')
  rz.kill()
  process.exit(1)
})
