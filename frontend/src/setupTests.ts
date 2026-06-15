// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: () => ({
    fillRect: jest.fn(),
    fillText: jest.fn(),
    getImageData: jest.fn(() => ({})),
    measureText: jest.fn((text: string) => ({ width: text.length * 8 })),
    putImageData: jest.fn()
  })
})
