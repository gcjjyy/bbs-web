import { vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TextDecoder } from 'util'
import useZmodem, { type UseZmodemReturn } from './useZmodem'

const testGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
testGlobal.IS_REACT_ACT_ENVIRONMENT = true
testGlobal.TextDecoder = TextDecoder as typeof globalThis.TextDecoder

type ReceiverCallbacks = {
  onSend: (data: Uint8Array) => void
  onSessionComplete: () => void
  onError: (error: string) => void
}

const { mockReceiverInstances, MockZmodemReceiver, MockZmodemSender } =
  vi.hoisted(() => {
    const mockReceiverInstances: Array<{
      callbacks: {
        onSend: (data: Uint8Array) => void
        onSessionComplete: () => void
        onError: (error: string) => void
      }
      start: ReturnType<typeof vi.fn>
      processData: ReturnType<typeof vi.fn>
    }> = []

    class MockZmodemReceiver {
      callbacks: (typeof mockReceiverInstances)[number]['callbacks']
      start = vi.fn()
      processData = vi.fn()

      constructor(
        callbacks: (typeof mockReceiverInstances)[number]['callbacks']
      ) {
        this.callbacks = callbacks
        mockReceiverInstances.push(this)
      }
    }

    class MockZmodemSender {
      start = vi.fn()
      processData = vi.fn()
    }

    return { mockReceiverInstances, MockZmodemReceiver, MockZmodemSender }
  })

vi.mock('../zmodem', () => ({
  ZmodemReceiver: MockZmodemReceiver,
  ZmodemSender: MockZmodemSender,
  encodeCancelSequence: () => new Uint8Array([0x18])
}))

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
    result = useZmodem(vi.fn(), vi.fn())
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

  it('detects a download trigger split across two data events', () => {
    const hook = renderUseZmodem()
    const firstHalf = asciiBytes('rz\rB0000000')
    const secondHalf = asciiBytes('0000000')

    act(() => {
      expect(
        hook.getResult().processIncomingData(arrayBuffer(firstHalf))
      ).toBe(false)
    })
    expect(mockReceiverInstances).toHaveLength(0)

    act(() => {
      expect(
        hook.getResult().processIncomingData(arrayBuffer(secondHalf))
      ).toBe(true)
    })
    expect(mockReceiverInstances).toHaveLength(1)
    hook.unmount()
  })

  it('does not treat data during an active session as a fresh trigger tail', () => {
    const hook = renderUseZmodem()

    act(() => {
      hook.getResult().processIncomingData(arrayBuffer(asciiBytes('**B0')))
    })

    // Full trigger in one packet starts a session and consumes the tail
    act(() => {
      expect(
        hook
          .getResult()
          .processIncomingData(arrayBuffer(asciiBytes('B00000000000000')))
      ).toBe(true)
    })
    act(() => {
      mockReceiverInstances[0].callbacks.onSessionComplete()
    })

    // Text that would complete the stale '**B0' tail must not trigger
    act(() => {
      expect(
        hook
          .getResult()
          .processIncomingData(arrayBuffer(asciiBytes('100 items found')))
      ).toBe(false)
    })
    expect(mockReceiverInstances).toHaveLength(1)
    hook.unmount()
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
