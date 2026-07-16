import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import App from './App'
import { terminalState } from './terminal/state'

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
  terminalState.cursor = { x: 0, y: 0 }
  terminalState.wrapPending = false
  terminalState.wideCharCells.clear()
})

test('renders app component', () => {
  const { container } = render(<App />)
  expect(container).toBeTruthy()
})

test('uses a hidden textarea only as an IME bridge', () => {
  render(<App />)
  const input = screen.getByLabelText('터미널 입력')

  expect(input.tagName).toBe('TEXTAREA')
  expect(input).toHaveClass('terminal-ime-input')
  expect(input).not.toHaveAttribute('type')
  expect(input).not.toHaveClass('command-password')
  expect(input).toHaveAttribute('autocomplete', 'off')
  expect(input).toHaveAttribute('data-lpignore', 'true')
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

test('sends two backspaces after a two-column character', () => {
  terminalState.cursor = { x: 2, y: 0 }
  terminalState.wideCharCells.add('0,0')
  render(<App />)
  const input = screen.getByLabelText('터미널 입력')

  fireEvent.keyDown(input, { key: 'Backspace', code: 'Backspace' })

  expect(sendTerminalInputMock).toHaveBeenCalledWith('\b\b')
})
