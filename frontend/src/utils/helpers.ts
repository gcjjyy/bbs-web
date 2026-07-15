/**
 * Convert bytes to human-readable format
 */
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + units[i]
}

/**
 * Rate-limit progress updates: returns true at most once per interval,
 * except the final update (done >= total) which always passes.
 */
export const createProgressThrottle = (
  intervalMs: number,
  now: () => number = Date.now
): ((done: number, total: number) => boolean) => {
  let lastUpdate = -Infinity
  return (done: number, total: number): boolean => {
    if (done >= total) return true
    const current = now()
    if (current - lastUpdate >= intervalMs) {
      lastUpdate = current
      return true
    }
    return false
  }
}

/**
 * Check if a string contains only ASCII characters
 */
export const isAsciiOnly = (str: string): boolean => {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7F]*$/.test(str)
}
