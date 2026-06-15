import { ZCRCW, ZFILE, ZRPOS } from './constants'
import { encodeBinaryHeader32, encodeDataSubpacket32 } from './encode'
import { ZmodemParser, type ZmodemHeader } from './decode'
import { ZmodemReceiver, type FileInfo } from './receive'

const { TextDecoder: NodeTextDecoder } = require('util')

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
