import { describe, expect, test } from 'bun:test'
import {
  handleTelnetDo,
  handleTelnetSub,
  preprocessBlockChars,
  resolveBBSTarget
} from './telnet'
import { BBS_ADDR, BBS_PORT } from './constants'

const ESC = '\x1b'

describe('resolveBBSTarget', () => {
  test('passes through a valid host and port', () => {
    expect(resolveBBSTarget('example.com', '1234')).toEqual({
      host: 'example.com',
      port: 1234
    })
  })

  test('falls back to defaults when both are missing', () => {
    expect(resolveBBSTarget(undefined, undefined)).toEqual({
      host: BBS_ADDR,
      port: BBS_PORT
    })
  })

  test('falls back to the default host when it contains invalid characters', () => {
    expect(resolveBBSTarget('evil.com/../etc', '1234')).toEqual({
      host: BBS_ADDR,
      port: 1234
    })
  })

  test('falls back to the default host when it is an empty string', () => {
    expect(resolveBBSTarget('', '1234')).toEqual({
      host: BBS_ADDR,
      port: 1234
    })
  })

  test('trims surrounding whitespace from a valid host', () => {
    expect(resolveBBSTarget('  example.com  ', '1234')).toEqual({
      host: 'example.com',
      port: 1234
    })
  })

  test('falls back to the default port when out of range', () => {
    expect(resolveBBSTarget('example.com', '0')).toEqual({
      host: 'example.com',
      port: BBS_PORT
    })
    expect(resolveBBSTarget('example.com', '70000')).toEqual({
      host: 'example.com',
      port: BBS_PORT
    })
  })

  test('falls back to the default port when not an integer', () => {
    expect(resolveBBSTarget('example.com', '9000.5')).toEqual({
      host: 'example.com',
      port: BBS_PORT
    })
    expect(resolveBBSTarget('example.com', 'not-a-number')).toEqual({
      host: 'example.com',
      port: BBS_PORT
    })
  })

  test('ignores non-string query values', () => {
    expect(resolveBBSTarget(['array'], ['1234'])).toEqual({
      host: BBS_ADDR,
      port: BBS_PORT
    })
  })
})

describe('preprocessBlockChars', () => {
  test('replaces full block (0xADFC) with ESC[=901B', () => {
    const input = Buffer.from([0xAD, 0xFC])
    expect(preprocessBlockChars(input).toString('latin1')).toBe(`${ESC}[=901B`)
  })

  test('replaces lower half block (0xADFD) with ESC[=903B', () => {
    const input = Buffer.from([0xAD, 0xFD])
    expect(preprocessBlockChars(input).toString('latin1')).toBe(`${ESC}[=903B`)
  })

  test('replaces upper half block (0xAEA2) with ESC[=902B', () => {
    const input = Buffer.from([0xAE, 0xA2])
    expect(preprocessBlockChars(input).toString('latin1')).toBe(`${ESC}[=902B`)
  })

  test('passes plain ASCII through unchanged', () => {
    const input = Buffer.from('hello, world\r\n', 'ascii')
    expect(preprocessBlockChars(input).equals(input)).toBe(true)
  })

  test('passes normal EUC-KR bytes through unchanged', () => {
    // '한글' in EUC-KR: C7 D1 B1 DB
    const input = Buffer.from([0xC7, 0xD1, 0xB1, 0xDB])
    expect(preprocessBlockChars(input).equals(input)).toBe(true)
  })

  test('replaces blocks embedded in surrounding text', () => {
    const input = Buffer.concat([
      Buffer.from('a', 'ascii'),
      Buffer.from([0xAD, 0xFC]),
      Buffer.from('b', 'ascii')
    ])
    expect(preprocessBlockChars(input).toString('latin1')).toBe(
      `a${ESC}[=901Bb`
    )
  })

  test('keeps a trailing lone first byte untouched', () => {
    const input = Buffer.from([0x41, 0xAD])
    expect(preprocessBlockChars(input).equals(input)).toBe(true)
  })
})

const createNegotiationSocket = () => {
  const calls = {
    will: [] as number[],
    wont: [] as number[],
    sub: [] as Array<{ option: number; data: Buffer }>
  }
  const socket = {
    writeWill: (option: number) => calls.will.push(option),
    writeWont: (option: number) => calls.wont.push(option),
    writeSub: (option: number, data: Buffer) => {
      calls.sub.push({ option, data })
    }
  }

  return { calls, socket }
}

describe('telnet option negotiation', () => {
  test('waits for TERMINAL-TYPE SEND after accepting the option', () => {
    const { calls, socket } = createNegotiationSocket()

    handleTelnetDo(socket, 24)

    expect(calls.will).toEqual([24])
    expect(calls.sub).toEqual([])
  })

  test('responds to TERMINAL-TYPE SEND with IS vt100', () => {
    const { calls, socket } = createNegotiationSocket()

    handleTelnetSub(socket, 24, Buffer.from([1]))

    expect(calls.sub).toHaveLength(1)
    expect(calls.sub[0]!.option).toBe(24)
    expect([...calls.sub[0]!.data]).toEqual([0, 118, 116, 49, 48, 48])
  })

  test('ignores unrelated subnegotiations', () => {
    const { calls, socket } = createNegotiationSocket()

    handleTelnetSub(socket, 24, Buffer.from([0]))
    handleTelnetSub(socket, 31, Buffer.from([1]))

    expect(calls.sub).toEqual([])
  })

  test('reports the 80 by 33 terminal size after accepting NAWS', () => {
    const { calls, socket } = createNegotiationSocket()

    handleTelnetDo(socket, 31)

    expect(calls.will).toEqual([31])
    expect(calls.sub).toHaveLength(1)
    expect(calls.sub[0]!.option).toBe(31)
    expect([...calls.sub[0]!.data]).toEqual([0, 80, 0, 33])
  })

  test('refuses unsupported options', () => {
    const { calls, socket } = createNegotiationSocket()

    handleTelnetDo(socket, 39)

    expect(calls.wont).toEqual([39])
    expect(calls.will).toEqual([])
  })
})
