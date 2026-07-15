import { vi, type Mock } from 'vitest'
type Handler = (...args: unknown[]) => void

interface FakeSocket {
  handlers: Record<string, Handler[]>
  on: (event: string, handler: Handler) => FakeSocket
  emit: Mock
  removeAllListeners: Mock
  disconnect: Mock
  fire: (event: string, ...args: unknown[]) => void
}

function createFakeSocket(): FakeSocket {
  const socket: FakeSocket = {
    handlers: {},
    on(event, handler) {
      socket.handlers[event] = socket.handlers[event] ?? []
      socket.handlers[event].push(handler)
      return socket
    },
    emit: vi.fn(),
    removeAllListeners: vi.fn(),
    disconnect: vi.fn(),
    fire(event, ...args) {
      for (const handler of socket.handlers[event] ?? []) {
        handler(...args)
      }
    }
  }
  return socket
}

let mockSocket: FakeSocket

vi.mock('socket.io-client', () => ({
  __esModule: true,
  default: vi.fn()
}))

import { TextEncoder } from 'util'
import io from 'socket.io-client'
import { setupNetwork } from './network'
import { resetTerminalState, terminalState } from './state'

const ioMock = io as unknown as Mock

const terminalRef = {
  current: {
    width: 640,
    height: 528,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640 })
  } as HTMLCanvasElement
}
const smartMouseBoxRef = { current: { style: {} } as HTMLDivElement }
const commandRef = { current: { style: {} } as HTMLInputElement }

const setup = () =>
  setupNetwork(terminalRef, smartMouseBoxRef, commandRef, vi.fn(), vi.fn())

beforeEach(() => {
  mockSocket = createFakeSocket()
  ioMock.mockReturnValue(mockSocket)
  resetTerminalState()
  terminalState.io = null
  terminalState.ctx2d = {
    fillStyle: '',
    fillRect: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 8 })),
    drawImage: vi.fn(),
    canvas: terminalRef.current
  } as unknown as CanvasRenderingContext2D
  terminalState.COLOR = Array.from({ length: 16 }, (_, i) => String(i))
})

test('reconnect resets terminal state and announces the new session', () => {
  setup()

  mockSocket.fire('connect')
  mockSocket.fire('data', new TextEncoder().encode('old session screen').buffer)
  expect(terminalState.lastPageText).toContain('old session screen')

  mockSocket.fire('disconnect')
  mockSocket.fire('connect')

  expect(terminalState.lastPageText).not.toContain('old session screen')
  expect(terminalState.lastPageText).toContain('재접속되었습니다')
})

test('first connect does not announce a reconnect', () => {
  setup()

  mockSocket.fire('connect')

  expect(terminalState.lastPageText).not.toContain('재접속되었습니다')
})

test('bbs-error messages are written to the terminal', () => {
  setup()

  mockSocket.fire('connect')
  mockSocket.fire('bbs-error', { message: 'BBS disconnected' })

  expect(terminalState.lastPageText).toContain('BBS disconnected')
})
