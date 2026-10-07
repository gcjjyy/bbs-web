import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import App from './App'
import { terminalState } from './terminal/state'

const { sendTerminalInputMock, setTerminalCompositionMock } = vi.hoisted(
  () => ({
    sendTerminalInputMock: vi.fn(),
    setTerminalCompositionMock: vi.fn()
  })
)

vi.mock('./terminal/network', () => ({
  setupNetwork: vi.fn(),
  enterCommand: vi.fn(),
  disconnectSocket: vi.fn(),
  setDataInterceptor: vi.fn(),
  sendTerminalInput: sendTerminalInputMock
}))

vi.mock('./terminal/inputOverlay', () => ({
  setupTerminalInputOverlay: vi.fn(),
  setTerminalComposition: setTerminalCompositionMock
}))

const flushTimers = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 10))

const inputValue = (
  input: HTMLElement,
  value: string,
  isComposing: boolean,
  inputType = isComposing ? 'insertCompositionText' : 'insertText'
): void => {
  fireEvent.input(input, {
    target: { value },
    isComposing,
    inputType
  })
}

beforeEach(() => {
  sendTerminalInputMock.mockClear()
  setTerminalCompositionMock.mockClear()
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

test('sends ordinary text immediately and clears the field', async () => {
  render(<App />)
  const input = screen.getByLabelText('터미널 입력')

  inputValue(input, 'a', false)

  expect(sendTerminalInputMock).toHaveBeenCalledWith('a')
  await waitFor(() => expect(input).toHaveValue(''))
})

test('sends a completed IME composition once', () => {
  render(<App />)
  const input = screen.getByLabelText('터미널 입력')

  fireEvent.compositionStart(input)
  inputValue(input, '한', true)
  expect(sendTerminalInputMock).not.toHaveBeenCalled()

  fireEvent.compositionEnd(input, { data: '한' })
  expect(sendTerminalInputMock).toHaveBeenCalledTimes(1)
  expect(sendTerminalInputMock).toHaveBeenCalledWith('한')

  // Firefox and Safari emit one non-composing input event immediately after
  // compositionend. It must not duplicate the committed text.
  inputValue(input, '한', false, 'insertFromComposition')
  expect(sendTerminalInputMock).toHaveBeenCalledTimes(1)
})

test('keeps the next syllable composing when the previous one commits with it in the field', async () => {
  // iOS Safari commits "한" and sets the marked text "ㄱ" in one step, so the
  // field already reads "한ㄱ" when compositionend for "한" arrives.
  render(<App />)
  const input = screen.getByLabelText('터미널 입력')

  fireEvent.compositionStart(input)
  inputValue(input, '한', true)
  ;(input as HTMLTextAreaElement).value = '한ㄱ'
  fireEvent.compositionEnd(input, { data: '한' })
  inputValue(input, '한ㄱ', false, 'insertFromComposition')

  expect(sendTerminalInputMock).toHaveBeenCalledTimes(1)
  expect(sendTerminalInputMock).toHaveBeenCalledWith('한')

  fireEvent.compositionStart(input)
  inputValue(input, '한ㄱ', true)
  expect(setTerminalCompositionMock).toHaveBeenLastCalledWith('ㄱ')
  inputValue(input, '한그', true)
  inputValue(input, '한글', true)
  expect(setTerminalCompositionMock).toHaveBeenLastCalledWith('글')
  expect(sendTerminalInputMock).toHaveBeenCalledTimes(1)

  fireEvent.compositionEnd(input, { data: '글' })
  expect(sendTerminalInputMock).toHaveBeenCalledTimes(2)
  expect(sendTerminalInputMock).toHaveBeenLastCalledWith('글')

  // The field is never rewritten while Hangul may still be extended.
  await flushTimers()
  expect(input).toHaveValue('한글')
})

test('sends a whole word once when the IME composes across syllables', () => {
  // Android Chrome keeps one composition running until a word break.
  render(<App />)
  const input = screen.getByLabelText('터미널 입력')

  fireEvent.compositionStart(input)
  inputValue(input, '한', true)
  inputValue(input, '한ㄱ', true)
  inputValue(input, '한글', true)
  expect(sendTerminalInputMock).not.toHaveBeenCalled()

  fireEvent.compositionEnd(input, { data: '한글' })
  expect(sendTerminalInputMock).toHaveBeenCalledTimes(1)
  expect(sendTerminalInputMock).toHaveBeenCalledWith('한글')
})

test('retracts and resends when the IME rewrites a syllable without composition events', async () => {
  // Some Android keyboards commit every jamo as plain text and then replace
  // the previous commit instead of using composition events.
  render(<App />)
  const input = screen.getByLabelText('터미널 입력')

  inputValue(input, 'ㅎ', false)
  inputValue(input, '', false, 'deleteContentBackward')
  inputValue(input, '하', false)
  inputValue(input, '', false, 'deleteContentBackward')
  inputValue(input, '한', false)

  expect(sendTerminalInputMock.mock.calls.map((call) => call[0])).toEqual([
    'ㅎ',
    '\b\b',
    '하',
    '\b\b',
    '한'
  ])

  await flushTimers()
  expect(input).toHaveValue('한')
})

test('sends backspace when the field shrinks without a keydown', () => {
  render(<App />)
  const input = screen.getByLabelText('터미널 입력')

  inputValue(input, 'ab', false)
  inputValue(input, 'a', false, 'deleteContentBackward')

  expect(sendTerminalInputMock).toHaveBeenLastCalledWith('\b')
})

test('clears the field after Enter', () => {
  render(<App />)
  const input = screen.getByLabelText('터미널 입력')

  inputValue(input, '한', false)
  fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

  expect(sendTerminalInputMock).toHaveBeenLastCalledWith('\r')
  expect(input).toHaveValue('')
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
