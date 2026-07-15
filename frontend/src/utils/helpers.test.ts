import { formatBytes, createProgressThrottle } from './helpers'

test('formatBytes renders human readable sizes', () => {
  expect(formatBytes(0)).toBe('0 B')
  expect(formatBytes(1024)).toBe('1 KB')
  expect(formatBytes(8 * 1024 * 1024)).toBe('8 MB')
})

describe('createProgressThrottle', () => {
  test('allows the first update immediately', () => {
    let time = 1000
    const shouldUpdate = createProgressThrottle(100, () => time)
    expect(shouldUpdate(10, 1000)).toBe(true)
  })

  test('suppresses updates arriving within the interval', () => {
    let time = 1000
    const shouldUpdate = createProgressThrottle(100, () => time)
    shouldUpdate(10, 1000)

    time = 1050
    expect(shouldUpdate(20, 1000)).toBe(false)

    time = 1100
    expect(shouldUpdate(30, 1000)).toBe(true)
  })

  test('always allows the final update', () => {
    let time = 1000
    const shouldUpdate = createProgressThrottle(100, () => time)
    shouldUpdate(10, 1000)

    time = 1010
    expect(shouldUpdate(1000, 1000)).toBe(true)
  })
})
