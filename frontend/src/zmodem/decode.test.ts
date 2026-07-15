import { ZCRCG } from './constants'
import { ZmodemParser, type ZmodemData } from './decode'
import { encodeDataSubpacket16, encodeDataSubpacket32 } from './encode'

function parseDataSubpacket(
  packet: Uint8Array,
  useCrc32: boolean
): ZmodemData {
  const dataPackets: ZmodemData[] = []
  const parser = new ZmodemParser({
    onData: (data) => dataPackets.push(data)
  })

  parser.startDataMode(useCrc32)
  parser.parse(packet)

  expect(dataPackets).toHaveLength(1)
  return dataPackets[0]
}

function corruptLastByte(packet: Uint8Array): Uint8Array {
  const corrupted = new Uint8Array(packet)
  corrupted[corrupted.length - 1] ^= 0x01
  return corrupted
}

describe('ZmodemParser data subpacket CRC verification', () => {
  it('reports crcOk true and preserves payload for CRC16 data subpackets', () => {
    const payload = new Uint8Array([0x41, 0x18, 0x11, 0x7f, 0xff, 0x42])
    const packet = encodeDataSubpacket16(payload, ZCRCG)

    const parsed = parseDataSubpacket(packet, false)

    expect(parsed.crcOk).toBe(true)
    expect(parsed.frameEnd).toBe(ZCRCG)
    expect(parsed.data).toEqual(payload)
  })

  it('reports crcOk false for corrupted CRC16 data subpackets', () => {
    const payload = new Uint8Array([0x41, 0x42, 0x43])
    const packet = corruptLastByte(encodeDataSubpacket16(payload, ZCRCG))

    const parsed = parseDataSubpacket(packet, false)

    expect(parsed.crcOk).toBe(false)
    expect(parsed.data).toEqual(payload)
  })

  it('reports crcOk true and preserves payload for CRC32 data subpackets', () => {
    const payload = new Uint8Array([0x00, 0x41, 0x18, 0x13, 0x90, 0x42])
    const packet = encodeDataSubpacket32(payload, ZCRCG)

    const parsed = parseDataSubpacket(packet, true)

    expect(parsed.crcOk).toBe(true)
    expect(parsed.frameEnd).toBe(ZCRCG)
    expect(parsed.data).toEqual(payload)
  })

  it('reports crcOk false for corrupted CRC32 data subpackets', () => {
    const payload = new Uint8Array([0x41, 0x42, 0x43, 0x44])
    const packet = corruptLastByte(encodeDataSubpacket32(payload, ZCRCG))

    const parsed = parseDataSubpacket(packet, true)

    expect(parsed.crcOk).toBe(false)
    expect(parsed.data).toEqual(payload)
  })
})

describe('ZmodemParser binary header CRC verification', () => {
  it('reports crcOk true when the CRC32 high byte is >= 0x80', () => {
    // ZDATA at position 0 produces a CRC32 with the sign bit set, which
    // regressed to a false mismatch when assembled as a signed integer
    const { encodeBinaryHeader32 } = require('./encode')
    const { ZDATA } = require('./constants')
    const headers: Array<{ crcOk: boolean; type: number }> = []
    const parser = new ZmodemParser({
      onHeader: (header) => headers.push(header)
    })

    parser.parse(encodeBinaryHeader32(ZDATA, 0))

    expect(headers).toHaveLength(1)
    expect(headers[0].type).toBe(ZDATA)
    expect(headers[0].crcOk).toBe(true)
  })
})
