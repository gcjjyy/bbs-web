// Environment variable helpers for configuration overrides

export function envString(name: string, fallback: string): string {
  const value = process.env[name]
  return value ? value : fallback
}

export function envInt(name: string, fallback: number): number {
  const value = process.env[name]
  if (!value) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}
