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
 * Check if a string contains only ASCII characters
 */
export const isAsciiOnly = (str: string): boolean => {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7F]*$/.test(str)
}
