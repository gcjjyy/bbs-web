/**
 * Verify CRC32 calculation
 */

import { crc32, crc32Finish } from '../src/zmodem/crc.js'

// ZDATA header bytes (type=0x0a, position=0)
const headerBytes = new Uint8Array([0x0a, 0x00, 0x00, 0x00, 0x00])

console.log('Header bytes:', Array.from(headerBytes).map(b => b.toString(16).padStart(2, '0')).join(' '))

let crc = crc32(headerBytes)
console.log('CRC32 before finish:', crc.toString(16))

crc = crc32Finish(crc)
console.log('CRC32 after finish:', crc.toString(16))

// Print as little-endian bytes
const crcBytes = [
  crc & 0xff,
  (crc >> 8) & 0xff,
  (crc >> 16) & 0xff,
  (crc >> 24) & 0xff
]
console.log('CRC32 bytes (little-endian):', crcBytes.map(b => b.toString(16).padStart(2, '0')).join(' '))

// Expected from sz: bc ef 92 8c = 0x8c92efbc
console.log('\nExpected (from sz): bc ef 92 8c')

// Let's also try without finish
console.log('\n--- Without crc32Finish ---')
let crc2 = crc32(headerBytes)
const crc2Bytes = [
  crc2 & 0xff,
  (crc2 >> 8) & 0xff,
  (crc2 >> 16) & 0xff,
  (crc2 >> 24) & 0xff
]
console.log('CRC32 bytes (without finish):', crc2Bytes.map(b => b.toString(16).padStart(2, '0')).join(' '))

// Let's verify using Node's built-in CRC32
import { createHash } from 'crypto'
import * as zlib from 'zlib'

const crc32Node = zlib.crc32(Buffer.from(headerBytes))
console.log('\n--- Node zlib.crc32 ---')
console.log('CRC32:', crc32Node.toString(16))
const crc32NodeBytes = [
  crc32Node & 0xff,
  (crc32Node >> 8) & 0xff,
  (crc32Node >> 16) & 0xff,
  (crc32Node >> 24) & 0xff
]
console.log('CRC32 bytes:', crc32NodeBytes.map(b => b.toString(16).padStart(2, '0')).join(' '))
