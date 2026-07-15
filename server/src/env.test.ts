import { describe, expect, test } from 'bun:test'
import { envString, envInt } from './env'

describe('envString', () => {
  test('returns fallback when variable is not set', () => {
    delete process.env.TEST_ENV_STRING
    expect(envString('TEST_ENV_STRING', 'fallback')).toBe('fallback')
  })

  test('returns fallback when variable is empty', () => {
    process.env.TEST_ENV_STRING = ''
    expect(envString('TEST_ENV_STRING', 'fallback')).toBe('fallback')
  })

  test('returns the variable value when set', () => {
    process.env.TEST_ENV_STRING = 'custom.host.kr'
    expect(envString('TEST_ENV_STRING', 'fallback')).toBe('custom.host.kr')
  })
})

describe('envInt', () => {
  test('returns fallback when variable is not set', () => {
    delete process.env.TEST_ENV_INT
    expect(envInt('TEST_ENV_INT', 9000)).toBe(9000)
  })

  test('returns the parsed number when set', () => {
    process.env.TEST_ENV_INT = '2323'
    expect(envInt('TEST_ENV_INT', 9000)).toBe(2323)
  })

  test('returns fallback when the value is not a number', () => {
    process.env.TEST_ENV_INT = 'abc'
    expect(envInt('TEST_ENV_INT', 9000)).toBe(9000)
  })
})
