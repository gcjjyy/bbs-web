import { ZCRCG, ZCRCW, ZDATA, ZEOF, ZFILE, ZRPOS } from './constants'
import { encodeBinaryHeader32, encodeDataSubpacket32 } from './encode'
import { ZmodemParser, type ZmodemHeader } from './decode'
import { ZmodemReceiver, type FileInfo } from './receive'

import { TextDecoder as NodeTextDecoder } from 'util'

beforeAll(() => {
  Object.assign(global, { TextDecoder: NodeTextDecoder })
})

function corruptLastByte(packet: Uint8Array): Uint8Array {
  const corrupted = new Uint8Array(packet)
  corrupted[corrupted.length - 1] ^= 0x01
  return corrupted
}

function makeFileInfo(name: string, size: number): Uint8Array {
  return Uint8Array.from(`${name}\0${size} 0 644\0`, (char) =>
    char.charCodeAt(0)
  )
}

function sentHeaderTypes(sent: Uint8Array[]): number[] {
  const headers: number[] = []
  const parser = new ZmodemParser({
    onHeader: (header: ZmodemHeader) => headers.push(header.type)
  })

  for (const packet of sent) {
    parser.parse(packet)
  }

  return headers
}

describe('ZmodemReceiver', () => {
  it('delivers file data as chunks without concatenating', () => {
    const sent: Uint8Array[] = []
    let completedInfo: FileInfo | null = null
    let completedChunks: Uint8Array[] | null = null
    const receiver = new ZmodemReceiver({
      onSend: (data) => sent.push(data),
      onFileComplete: (info, chunks) => {
        completedInfo = info
        completedChunks = chunks
      }
    })

    receiver.start()
    receiver.processData(encodeBinaryHeader32(ZFILE, 0))
    receiver.processData(
      encodeDataSubpacket32(makeFileInfo('test.bin', 6), ZCRCW)
    )
    receiver.processData(encodeBinaryHeader32(ZDATA, 0))
    receiver.processData(
      encodeDataSubpacket32(Uint8Array.from([1, 2, 3]), ZCRCG)
    )
    receiver.processData(
      encodeDataSubpacket32(Uint8Array.from([4, 5, 6]), ZCRCW)
    )
    receiver.processData(encodeBinaryHeader32(ZEOF, 6))

    expect(completedInfo).toMatchObject({ name: 'test.bin', size: 6 })
    expect(completedChunks).not.toBeNull()
    expect(completedChunks!.length).toBeGreaterThan(1)
    expect(
      completedChunks!.flatMap((chunk) => Array.from(chunk))
    ).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('continues receiving when a data subpacket CRC check is incompatible', () => {
    const sent: Uint8Array[] = []
    const fileStarts: FileInfo[] = []
    const errors: string[] = []
    const receiver = new ZmodemReceiver({
      onSend: (data) => sent.push(data),
      onFileStart: (info) => fileStarts.push(info),
      onError: (error) => errors.push(error)
    })

    receiver.start()
    receiver.processData(encodeBinaryHeader32(ZFILE, 0))
    receiver.processData(
      corruptLastByte(encodeDataSubpacket32(makeFileInfo('test.txt', 3), ZCRCW))
    )

    expect(fileStarts).toHaveLength(1)
    expect(fileStarts[0]).toMatchObject({ name: 'test.txt', size: 3 })
    expect(errors).toEqual([])
    expect(sentHeaderTypes(sent)).toContain(ZRPOS)
  })
})
