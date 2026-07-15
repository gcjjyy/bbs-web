export interface TerminalKeyEvent {
  key: string
  code: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
  isComposing: boolean
  altGraphKey: boolean
}

const FUNCTION_KEY_CODES: Record<string, string> = {
  F1: 'P',
  F2: 'Q',
  F3: 'R',
  F4: 'S'
}

const TILDE_KEY_CODES: Record<string, number> = {
  Insert: 2,
  Delete: 3,
  PageUp: 5,
  PageDown: 6,
  F5: 15,
  F6: 17,
  F7: 18,
  F8: 19,
  F9: 20,
  F10: 21,
  F11: 23,
  F12: 24
}

const modifierCode = (event: TerminalKeyEvent): number =>
  1 +
  (event.shiftKey ? 1 : 0) +
  (event.altKey ? 2 : 0) +
  (event.ctrlKey ? 4 : 0)

const modifiedCsi = (
  event: TerminalKeyEvent,
  finalChar: string
): string => {
  const modifier = modifierCode(event)
  return modifier === 1
    ? `\x1b[${finalChar}`
    : `\x1b[1;${modifier}${finalChar}`
}

const modifiedTilde = (
  event: TerminalKeyEvent,
  keyCode: number
): string => {
  const modifier = modifierCode(event)
  return modifier === 1
    ? `\x1b[${keyCode}~`
    : `\x1b[${keyCode};${modifier}~`
}

const controlSequence = (event: TerminalKeyEvent): string | null => {
  const key = event.key.toLowerCase()

  if (key >= 'a' && key <= 'z') {
    return String.fromCharCode(key.charCodeAt(0) - 96)
  }

  switch (event.key) {
    case '@':
    case ' ':
      return '\x00'
    case '[':
      return '\x1b'
    case '\\':
      return '\x1c'
    case ']':
      return '\x1d'
    case '^':
      return '\x1e'
    case '_':
      return '\x1f'
    case '?':
      return '\x7f'
  }

  switch (event.code) {
    case 'Digit2':
      return '\x00'
    case 'Digit6':
      return '\x1e'
    case 'Minus':
      return '\x1f'
  }

  return null
}

/**
 * Convert a browser keydown into the bytes emitted by a VT100-style terminal.
 * A null return value leaves printable text to the input/IME event path.
 */
export const getTerminalKeySequence = (
  event: TerminalKeyEvent,
  applicationCursorKeys: boolean
): string | null => {
  if (event.isComposing || event.altGraphKey || event.metaKey) {
    return null
  }

  const hasModifiers = event.shiftKey || event.altKey || event.ctrlKey

  switch (event.key) {
    case 'Enter':
      return '\r'
    case 'Backspace':
      return '\b'
    case 'Tab':
      return event.shiftKey ? '\x1b[Z' : '\t'
    case 'Escape':
      return '\x1b'
    case 'ArrowUp':
      return applicationCursorKeys && !hasModifiers
        ? '\x1bOA'
        : modifiedCsi(event, 'A')
    case 'ArrowDown':
      return applicationCursorKeys && !hasModifiers
        ? '\x1bOB'
        : modifiedCsi(event, 'B')
    case 'ArrowRight':
      return applicationCursorKeys && !hasModifiers
        ? '\x1bOC'
        : modifiedCsi(event, 'C')
    case 'ArrowLeft':
      return applicationCursorKeys && !hasModifiers
        ? '\x1bOD'
        : modifiedCsi(event, 'D')
    case 'Home':
      return modifiedCsi(event, 'H')
    case 'End':
      return modifiedCsi(event, 'F')
  }

  const functionCode = FUNCTION_KEY_CODES[event.key]
  if (functionCode) {
    const modifier = modifierCode(event)
    return modifier === 1
      ? `\x1bO${functionCode}`
      : `\x1b[1;${modifier}${functionCode}`
  }

  const tildeCode = TILDE_KEY_CODES[event.key]
  if (tildeCode) {
    return modifiedTilde(event, tildeCode)
  }

  // Ctrl+Shift+C/V remain available for browser clipboard shortcuts. Plain
  // Ctrl+C/V are terminal control characters, as on a native terminal.
  if (
    event.ctrlKey &&
    event.shiftKey &&
    (event.key.toLowerCase() === 'c' || event.key.toLowerCase() === 'v')
  ) {
    return null
  }

  if (event.ctrlKey) {
    return controlSequence(event)
  }

  if (event.altKey && Array.from(event.key).length === 1) {
    return `\x1b${event.key}`
  }

  return null
}

export const normalizePastedText = (text: string): string =>
  text.replace(/\r\n|\n/g, '\r')
