import { describe, expect, test } from 'bun:test'
import * as iconv from 'iconv-lite'
import { handleBBSData } from './zmodem'
import type { ExtendedSocket } from './types'

interface MockSocket {
  socket: ExtendedSocket
  emitted: Array<{ event: string; data: unknown }>
  decoded: Buffer[]
  written: Buffer[]
}

function createMockSocket(): MockSocket {
  const emitted: Array<{ event: string; data: unknown }> = []
  const decoded: Buffer[] = []
  const written: Buffer[] = []

  const socket = {
    zmodemActive: false,
    emit(event: string, data: unknown) {
      emitted.push({ event, data })
      return true
    },
    tSocket: {
      write(data: Buffer) {
        written.push(Buffer.from(data))
      },
      decodeStream: {
        write(data: Buffer) {
          decoded.push(Buffer.from(data))
          return true
        }
      }
    }
  }

  return {
    socket: socket as unknown as ExtendedSocket,
    emitted,
    decoded,
    written
  }
}

describe('handleBBSData', () => {
  test('activates ZMODEM mode on download trigger and forwards raw data', () => {
    const { socket, emitted, decoded } = createMockSocket()
    const buffer = Buffer.from('rz waiting **B00000000000000\r\n', 'latin1')

    handleBBSData(socket, buffer)

    expect(socket.zmodemActive).toBe(true)
    expect(emitted).toHaveLength(1)
    expect(emitted[0]!.event).toBe('data')
    expect(decoded).toHaveLength(0)
  })

  test('activates ZMODEM mode on upload trigger', () => {
    const { socket, emitted } = createMockSocket()
    const buffer = Buffer.from('**B0100000023be50\r\n', 'latin1')

    handleBBSData(socket, buffer)

    expect(socket.zmodemActive).toBe(true)
    expect(emitted).toHaveLength(1)
  })

  test('forwards data in 8KB chunks while ZMODEM is active', () => {
    const { socket, emitted } = createMockSocket()
    socket.zmodemActive = true
    const buffer = Buffer.alloc(20 * 1024, 0x41)

    handleBBSData(socket, buffer)

    expect(emitted).toHaveLength(3)
    expect((emitted[0]!.data as Buffer).length).toBe(8 * 1024)
    expect((emitted[2]!.data as Buffer).length).toBe(4 * 1024)
  })

  test('exits ZMODEM mode on five consecutive CAN bytes', () => {
    const { socket } = createMockSocket()
    socket.zmodemActive = true
    const buffer = Buffer.from([0x18, 0x18, 0x18, 0x18, 0x18, 0x08, 0x08])

    handleBBSData(socket, buffer)

    expect(socket.zmodemActive).toBe(false)
  })

  test('stays in ZMODEM mode when CAN bytes are not consecutive', () => {
    const { socket } = createMockSocket()
    socket.zmodemActive = true
    const buffer = Buffer.from([0x18, 0x18, 0x41, 0x18, 0x18, 0x18])

    handleBBSData(socket, buffer)

    expect(socket.zmodemActive).toBe(true)
  })

  test('routes normal text to the decode stream', () => {
    const { socket, emitted, decoded } = createMockSocket()
    const buffer = Buffer.from('welcome to the bbs\r\n', 'ascii')

    handleBBSData(socket, buffer)

    expect(socket.zmodemActive).toBe(false)
    expect(emitted).toHaveLength(0)
    expect(decoded).toHaveLength(1)
    expect(decoded[0]!.toString('ascii')).toBe('welcome to the bbs\r\n')
  })

  test('auto-selects ZMODEM when protocol prompt appears', () => {
    const { socket, written } = createMockSocket()
    const prompt = '송신 프로토콜(1:Xmodem, 2:Ymodem, 3:Zmodem):'
    const buffer = iconv.encode(prompt, 'cp949')

    handleBBSData(socket, buffer)

    expect(written).toHaveLength(1)
    expect(iconv.decode(written[0]!, 'cp949')).toBe('3\r\n')
  })
})
