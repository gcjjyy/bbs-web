// Type declarations for modules without TypeScript definitions

declare module 'browser-cookies' {
  interface CookieOptions {
    expires?: number | Date | string
    domain?: string
    path?: string
    secure?: boolean
    httponly?: boolean
    samesite?: 'strict' | 'lax' | 'none'
  }

  const cookies: {
    set(name: string, value: string, options?: CookieOptions): void
    get(name: string): string | null
    erase(name: string, options?: CookieOptions): void
    all(): Record<string, string>
  }

  export default cookies
}

declare module 'copy-to-clipboard' {
  interface Options {
    debug?: boolean
    message?: string
    format?: 'text/plain' | 'text/html'
    onCopy?: (clipboardData: DataTransfer) => void
  }

  function copy(text: string, options?: Options): boolean
  export default copy
}
