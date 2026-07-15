import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import App from './App'

const { sendTerminalInputMock } = vi.hoisted(() => ({
  sendTerminalInputMock: vi.fn()
}))

vi.mock('./terminal/network', () => ({
  setupNetwork: vi.fn(),
  enterCommand: vi.fn(),
  disconnectSocket: vi.fn(),
  setDataInterceptor: vi.fn(),
  sendTerminalInput: sendTerminalInputMock
}))

beforeEach(() => {
  sendTerminalInputMock.mockClear()
})

test('renders app component', () => {
  const { container } = render(<App />)
  expect(container).toBeTruthy()
})

test('sends ordinary text immediately', () => {
  render(<App />)
  const input = screen.getByLabelText('터미널 입력')

  fireEvent.input(input, {
    target: { value: 'a' },
    isComposing: false
  })

  expect(sendTerminalInputMock).toHaveBeenCalledWith('a')
  expect(input).toHaveValue('')
})

test('sends a completed IME composition once', () => {
  render(<App />)
  const input = screen.getByLabelText('터미널 입력')

  fireEvent.compositionStart(input)
  fireEvent.input(input, {
    target: { value: '한' },
    isComposing: true
  })
  expect(sendTerminalInputMock).not.toHaveBeenCalled()

  fireEvent.compositionEnd(input, { data: '한' })
  expect(sendTerminalInputMock).toHaveBeenCalledTimes(1)
  expect(sendTerminalInputMock).toHaveBeenCalledWith('한')

  // Browsers commonly emit one non-composing input event immediately after
  // compositionend. It must not duplicate the committed text.
  fireEvent.input(input, {
    target: { value: '한' },
    isComposing: false
  })
  expect(sendTerminalInputMock).toHaveBeenCalledTimes(1)
})

test('sends terminal key sequences on keydown', () => {
  render(<App />)
  const input = screen.getByLabelText('터미널 입력')

  fireEvent.keyDown(input, { key: 'ArrowUp', code: 'ArrowUp' })
  fireEvent.keyDown(input, { key: 'Backspace', code: 'Backspace' })
  fireEvent.keyDown(input, { key: 'o', code: 'KeyO', ctrlKey: true })

  expect(sendTerminalInputMock).toHaveBeenNthCalledWith(1, '\x1b[A')
  expect(sendTerminalInputMock).toHaveBeenNthCalledWith(2, '\b')
  expect(sendTerminalInputMock).toHaveBeenNthCalledWith(3, '\x0f')
})
