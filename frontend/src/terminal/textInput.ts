/**
 * Tracks what the hidden IME textarea holds versus what has already been
 * sent to the BBS. The textarea is never rewritten while an IME may still be
 * extending a syllable: mobile keyboards treat the field contents as their
 * composition state, and clearing it mid-syllable splits Hangul into jamo.
 */

const COMPOSITION_INPUT_TYPES = new Set([
  'insertCompositionText',
  'deleteCompositionText',
  'insertFromComposition',
  'deleteByComposition'
])

const ENDS_WITH_HANGUL = /[ㄱ-ㆎ가-힣]$/

const commonPrefixLength = (a: string, b: string): number => {
  let length = 0
  while (length < a.length && length < b.length && a[length] === b[length]) {
    length += 1
  }
  return length
}

const backspacesFor = (removed: string): string =>
  Array.from(removed)
    .map((ch) => (ch.charCodeAt(0) < 0x80 ? '\b' : '\b\b'))
    .join('')

export interface TextInputTracker {
  input: (
    field: HTMLTextAreaElement,
    isComposing: boolean,
    inputType: string | undefined
  ) => void
  compositionStart: () => void
  compositionEnd: (field: HTMLTextAreaElement, data: string | undefined) => void
  isComposing: () => boolean
  reset: (field: HTMLTextAreaElement) => void
}

export const createTextInputTracker = (
  send: (text: string) => void,
  preview: (text: string) => void
): TextInputTracker => {
  let sent = ''
  let composing = false

  // Clear the field only once nothing is pending and the last committed
  // character cannot be extended by an IME any more (or on Enter).
  const clearWhenIdle = (field: HTMLTextAreaElement): void => {
    setTimeout(() => {
      if (composing || field.value !== sent || ENDS_WITH_HANGUL.test(sent)) {
        return
      }
      field.value = ''
      sent = ''
    }, 0)
  }

  return {
    input: (field, isComposing, inputType) => {
      const value = field.value

      if (
        composing ||
        isComposing ||
        (inputType !== undefined && COMPOSITION_INPUT_TYPES.has(inputType))
      ) {
        preview(value.slice(sent.length))
        return
      }

      const prefix = commonPrefixLength(sent, value)
      const removed = sent.slice(prefix)
      const added = value.slice(prefix)
      sent = value
      preview('')

      if (removed) send(backspacesFor(removed))
      if (added) send(added)
      clearWhenIdle(field)
    },

    compositionStart: () => {
      composing = true
      preview('')
    },

    compositionEnd: (field, data) => {
      composing = false
      preview('')

      const committed = data ?? field.value.slice(sent.length)
      sent += committed
      if (committed) send(committed)
      clearWhenIdle(field)
    },

    isComposing: () => composing,

    reset: (field) => {
      field.value = ''
      sent = ''
      composing = false
      preview('')
    }
  }
}
