import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TextDecoder } from 'util'
import type { UseZmodemReturn } from './useZmodem'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder

type ReceiverCallbacks = {
  onSend: (data: Uint8Array) => void
  onSessionComplete: () => void
  onError: (error: string) => void
}

const mockReceiverInstances: MockZmodemReceiver[] = []

class MockZmodemReceiver {
  callbacks: ReceiverCallbacks
  start = jest.fn()
  processData = jest.fn()

  constructor(callbacks: ReceiverCallbacks) {
    this.callbacks = callbacks
    mockReceiverInstances.push(this)
  }
}

class MockZmodemSender {
  start = jest.fn()
  processData = jest.fn()
}

jest.mock('../zmodem', () => ({
  ZmodemReceiver: MockZmodemReceiver,
  ZmodemSender: MockZmodemSender,
  encodeCancelSequence: () => new Uint8Array([0x18])
}))

const useZmodem = require('./useZmodem').default as typeof import(
  './useZmodem'
).default

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer
}

function asciiBytes(text: string): Uint8Array {
  return new Uint8Array([...text].map((char) => char.charCodeAt(0)))
}

function renderUseZmodem(): {
  getResult: () => UseZmodemReturn
  unmount: () => void
} {
  let result: UseZmodemReturn | null = null
  const element = document.createElement('div')
  let root: Root

  function TestComponent() {
    result = useZmodem(jest.fn(), jest.fn())
    return null
  }

  act(() => {
    root = createRoot(element)
    root.render(<TestComponent />)
  })

  return {
    getResult: () => {
      if (!result) {
        throw new Error('Hook did not render')
      }
      return result
    },
    unmount: () => {
      act(() => {
        root.unmount()
      })
    }
  }
}

describe('useZmodem session cleanup', () => {
  beforeEach(() => {
    mockReceiverInstances.length = 0
  })

  it('does not consume normal terminal data after receiver completes', () => {
    const hook = renderUseZmodem()
    const trigger = asciiBytes('rz\rB00000000000000')
    const normalData = asciiBytes('normal terminal output')

    act(() => {
      expect(hook.getResult().processIncomingData(arrayBuffer(trigger))).toBe(
        true
      )
    })
    expect(mockReceiverInstances).toHaveLength(1)
    expect(mockReceiverInstances[0].processData).toHaveBeenCalledTimes(1)

    act(() => {
      mockReceiverInstances[0].callbacks.onSessionComplete()
    })

    act(() => {
      expect(hook.getResult().processIncomingData(arrayBuffer(normalData))).toBe(
        false
      )
    })
    expect(mockReceiverInstances[0].processData).toHaveBeenCalledTimes(1)
    hook.unmount()
  })
})
