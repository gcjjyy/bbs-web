/**
 * Test that our encoder output can be decoded by our parser
 */

import { ZmodemParser, encodeDataSubpacket32, encodeDataSubpacket16, ZCRCG } from '../src/zmodem/index.js'

console.log('=== Encode/Decode Self-Test ===\n')

// Test data
const testData = new Uint8Array([0x41, 0x42, 0x43, 0x44, 0x45]) // "ABCDE"

// Encode with CRC32
const encoded32 = encodeDataSubpacket32(testData, ZCRCG)
console.log('Encoded (CRC32):')
console.log('  Hex:', Array.from(encoded32).map(b => b.toString(16).padStart(2, '0')).join(' '))
console.log('  Length:', encoded32.length)

// Now decode it with our parser
let decoded32Data: Uint8Array | null = null
let decoded32FrameEnd: number | null = null
let decoded32CrcOk: boolean | null = null

const parser32 = new ZmodemParser({
  onData: (data) => {
    decoded32Data = data.data
    decoded32FrameEnd = data.frameEnd
    decoded32CrcOk = data.crcOk
    console.log('\nDecoded (CRC32):')
    console.log('  Data:', Array.from(data.data).map(b => b.toString(16).padStart(2, '0')).join(' '))
    console.log('  FrameEnd:', data.frameEnd.toString(16))
    console.log('  CRC OK:', data.crcOk)
  },
  onHeader: () => {},
  onCancel: () => {}
})

// Need to tell parser we're in data mode with CRC32
parser32.startDataMode(true)
parser32.parse(encoded32)

// Compare
console.log('\n=== Results ===')
if (decoded32CrcOk) {
  console.log('✓ CRC32 encoding/decoding works!')
} else {
  console.log('✗ CRC32 encoding/decoding FAILED!')
}

// Now let's compare with what sz would send
// by capturing sz output and seeing if our parser can decode it
console.log('\n\n=== Now let\'s see what sz actually sends ===')

import { spawn } from 'child_process'
import * as fs from 'fs'

// Create a test file
const testFile = '/tmp/test-zmodem-encode.bin'
fs.writeFileSync(testFile, testData)

// Run sz and capture its output
const sz = spawn('sz', ['-b', '-e', testFile], {
  stdio: ['pipe', 'pipe', 'inherit']
})

let szOutput = Buffer.alloc(0)

sz.stdout.on('data', (data: Buffer) => {
  szOutput = Buffer.concat([szOutput, data])
})

sz.on('close', () => {
  console.log('\nsz output:')
  console.log('  Hex:', Array.from(szOutput).map(b => b.toString(16).padStart(2, '0')).join(' '))
  console.log('  Length:', szOutput.length)

  // Find the data subpacket in sz output
  // It should be after ZDATA header
  // Let's just print the whole thing for analysis

  // Clean up
  fs.unlinkSync(testFile)
})

// Send ZRINIT to sz to start the transfer
setTimeout(() => {
  // ZRINIT header with CRC32 support
  const zrinit = Buffer.from('**\x18B0100000063f694\r\x8a\x11', 'latin1')
  sz.stdin.write(zrinit)
}, 100)

setTimeout(() => {
  sz.kill()
}, 2000)
