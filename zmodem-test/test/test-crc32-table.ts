/**
 * Generate and verify CRC32 table
 */

// Generate table dynamically
function makeCRC32Table(): Uint32Array {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let crc = i
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xEDB88320
      } else {
        crc >>>= 1
      }
    }
    table[i] = crc >>> 0
  }
  return table
}

const generatedTable = makeCRC32Table()

// My hardcoded table (from crc.ts)
const MY_TABLE = new Uint32Array([
  0x00000000, 0x77073096, 0xee0e612c, 0x990951ba, 0x076dc419, 0x706af48f,
  0xe963a535, 0x9e6495a3, 0x0edb8832, 0x79dcb8a4, 0xe0d5e91e, 0x97d2d988,
  // ... (just check first few)
])

console.log('=== Checking CRC32 table ===\n')

// Compare first few entries
console.log('First 10 entries comparison:')
for (let i = 0; i < 10; i++) {
  const gen = generatedTable[i]
  const my = MY_TABLE[i]
  const match = gen === my ? '✓' : '✗'
  console.log(`  [${i}]: generated=0x${gen.toString(16).padStart(8, '0')} mine=0x${my.toString(16).padStart(8, '0')} ${match}`)
}

// Check index 245 (0xF5) specifically
console.log(`\nIndex 245 (0xF5):`)
console.log(`  Generated: 0x${generatedTable[245].toString(16).padStart(8, '0')}`)

// Now calculate CRC32 using generated table
function crc32WithGenTable(data: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ generatedTable[(crc ^ data[i]) & 0xFF]
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

const testData = new Uint8Array([0x0a, 0x00, 0x00, 0x00, 0x00])
const result = crc32WithGenTable(testData)
console.log(`\nCRC32 of [0x0a, 0x00, 0x00, 0x00, 0x00]:`)
console.log(`  Using generated table: 0x${result.toString(16).padStart(8, '0')}`)

import * as zlib from 'zlib'
const zlibResult = zlib.crc32(Buffer.from(testData))
console.log(`  Using zlib: 0x${zlibResult.toString(16).padStart(8, '0')}`)

if (result === zlibResult) {
  console.log('\n✓ Results match!')
} else {
  console.log('\n✗ Results do NOT match!')
}

// Print the correct table for crc.ts
console.log('\n\n=== Correct CRC32 table for crc.ts ===')
const rows = []
for (let i = 0; i < 256; i += 6) {
  const row = []
  for (let j = i; j < Math.min(i + 6, 256); j++) {
    row.push('0x' + generatedTable[j].toString(16).padStart(8, '0'))
  }
  rows.push('  ' + row.join(', ') + ',')
}
console.log('const CRC32_TABLE = new Uint32Array([')
console.log(rows.join('\n'))
console.log('])')
