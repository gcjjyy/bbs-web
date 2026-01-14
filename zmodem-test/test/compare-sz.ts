/**
 * Compare our data subpacket encoding with sz's
 */

import { spawn } from 'child_process'
import * as fs from 'fs'
import { encodeDataSubpacket32, encodeBinaryHeader32, ZDATA, ZCRCG, ZCRCE } from '../src/zmodem/index.js'

const testData = new Uint8Array([0x41, 0x42, 0x43, 0x44, 0x45]) // "ABCDE"
const testFile = '/tmp/compare-sz-test.bin'

// Write test file
fs.writeFileSync(testFile, testData)

console.log('=== Comparing our encoding with sz ===\n')
console.log('Test data:', Array.from(testData).map(b => b.toString(16).padStart(2, '0')).join(' '))

// Our encoding
const ourZDATA = encodeBinaryHeader32(ZDATA, 0)
const ourDataPacket = encodeDataSubpacket32(testData, ZCRCE)  // Last packet uses ZCRCE

console.log('\n--- Our encoding ---')
console.log('ZDATA header:', Array.from(ourZDATA).map(b => b.toString(16).padStart(2, '0')).join(' '))
console.log('Data subpacket:', Array.from(ourDataPacket).map(b => b.toString(16).padStart(2, '0')).join(' '))

// Get sz's encoding
console.log('\n--- sz encoding ---')

const sz = spawn('sz', ['-b', '-e', testFile], {
  stdio: ['pipe', 'pipe', 'pipe']
})

let szOutput = Buffer.alloc(0)

sz.stdout.on('data', (data: Buffer) => {
  szOutput = Buffer.concat([szOutput, data])
})

sz.stderr.on('data', (data: Buffer) => {
  // Ignore stderr
})

// Send ZRINIT to trigger file transfer
setTimeout(() => {
  // ZRINIT with CRC32 support (flags = 0x63)
  const zrinit = Buffer.from('**\x18B0100000063f694\r\x8a\x11', 'latin1')
  sz.stdin.write(zrinit)
}, 100)

// Send ZRPOS to request data from position 0
setTimeout(() => {
  const zrpos = Buffer.from('**\x18B0900000000a87c\r\x8a\x11', 'latin1')
  sz.stdin.write(zrpos)
}, 300)

setTimeout(() => {
  sz.kill()

  console.log('Raw sz output length:', szOutput.length)
  console.log('Raw sz output:', Array.from(szOutput).map(b => b.toString(16).padStart(2, '0')).join(' '))

  // Find ZDATA header in output (ZPAD ZDLE ZBIN32 + type ZDATA)
  // ZBIN32 = 0x43 ('C'), ZDATA = 0x0a
  const output = new Uint8Array(szOutput)

  // Look for ZDATA pattern: 2a 18 43 ... (type 0x0a)
  for (let i = 0; i < output.length - 10; i++) {
    if (output[i] === 0x2a && output[i+1] === 0x18 && output[i+2] === 0x43) {
      console.log('\nFound potential ZBIN32 header at offset', i)

      // Check if next byte (after potential escaping) is ZDATA (0x0a)
      let typeOffset = i + 3
      let type = output[typeOffset]
      if (type === 0x18) {
        // Escaped
        type = output[typeOffset + 1] ^ 0x40
        console.log('Type (escaped):', type.toString(16), type === 0x0a ? '= ZDATA' : '')
      } else {
        console.log('Type:', type.toString(16), type === 0x0a ? '= ZDATA' : '')
      }

      // Print next 30 bytes for analysis
      const slice = output.slice(i, Math.min(i + 50, output.length))
      console.log('Bytes:', Array.from(slice).map(b => b.toString(16).padStart(2, '0')).join(' '))
    }
  }

  // Also look for frame end markers
  console.log('\n--- Looking for frame end markers ---')
  for (let i = 0; i < output.length - 1; i++) {
    if (output[i] === 0x18 && output[i+1] >= 0x68 && output[i+1] <= 0x6b) {
      const frameEnd = output[i+1]
      const frameNames = { 0x68: 'ZCRCE', 0x69: 'ZCRCG', 0x6a: 'ZCRCQ', 0x6b: 'ZCRCW' }
      console.log(`Found frame end at offset ${i}: 18 ${frameEnd.toString(16)} (${frameNames[frameEnd as keyof typeof frameNames]})`)

      // Print surrounding bytes
      const start = Math.max(0, i - 10)
      const end = Math.min(output.length, i + 10)
      const slice = output.slice(start, end)
      console.log('Context:', Array.from(slice).map(b => b.toString(16).padStart(2, '0')).join(' '))
    }
  }

  fs.unlinkSync(testFile)
}, 1000)
