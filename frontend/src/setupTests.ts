// jest-dom adds custom matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: () => ({
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({})),
    measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
    putImageData: vi.fn()
  })
})
