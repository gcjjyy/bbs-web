import io from 'socket.io-client'
import { Buffer } from 'buffer'
import { resetTerminalState, terminalState } from './useTerminalState'
import { write } from './useTerminalEmulation'
import type { RefObject, Dispatch, SetStateAction } from 'react'

const debug = require('debug')('bbs-web')

// Data interceptor type - returns true if data was consumed
export type DataInterceptor = (data: ArrayBuffer) => boolean

// Store the data interceptor for dynamic updates
let dataInterceptor: DataInterceptor | null = null

export const setDataInterceptor = (interceptor: DataInterceptor | null): void => {
  dataInterceptor = interceptor
}

export const setupNetwork = (
  terminalRef: RefObject<HTMLCanvasElement | null>,
  smartMouseBoxRef: RefObject<HTMLDivElement | null>,
  commandRef: RefObject<HTMLInputElement | null>,
  focusCommand: () => void,
  setCommandType: Dispatch<SetStateAction<string>>
): void => {
  const host = window.location.href

  disconnectSocket()

  debug('Start connecting...')
  terminalState.io = io(host, {
    // Prefer WebSocket for better performance, fallback to polling if blocked by proxy
    transports: ['websocket', 'polling']
  })

  // Socket.IO reconnects automatically, but the server opens a brand-new
  // BBS session for every connection, so the previous screen no longer
  // reflects reality
  let wasDisconnected = false

  terminalState.io.on('connect', () => {
    debug('Connected')
    focusCommand()

    const isReconnect = wasDisconnected
    wasDisconnected = false
    if (isReconnect) {
      resetTerminalState()
    }

    if (terminalState.ctx2d && terminalRef.current) {
      terminalState.ctx2d.fillStyle = terminalState.COLOR[terminalState.attr.backgroundColor]
      terminalState.ctx2d.fillRect(
        0,
        0,
        terminalRef.current.width,
        terminalRef.current.height
      )
    }

    // Clear whole webpage
    document.getElementsByTagName('body')[0].style.backgroundColor =
      terminalState.COLOR[terminalState.attr.backgroundColor]

    if (isReconnect) {
      write(
        '재접속되었습니다. 새 세션이 시작됩니다.\r\n',
        terminalRef,
        smartMouseBoxRef,
        commandRef
      )
    }
  })

  terminalState.io.on('disconnect', () => {
    debug('Disconnected')
    wasDisconnected = true
    write('접속이 종료되었습니다.\r\n', terminalRef, smartMouseBoxRef, commandRef)
  })

  terminalState.io.on('bbs-error', (payload: { message?: string }) => {
    const message = payload?.message ?? 'BBS 연결 오류'
    debug(`BBS error: ${message}`)
    write(`\r\n${message}\r\n`, terminalRef, smartMouseBoxRef, commandRef)
  })

  terminalState.io.on('data', (data: ArrayBuffer) => {
    // Try data interceptor first (for ZMODEM)
    if (dataInterceptor && dataInterceptor(data)) {
      // Data was consumed by interceptor
      return
    }

    // Check if the password input phrase
    const pattern = /비밀번호 :/
    const result = pattern.exec(Buffer.from(data).toString())
    if (result) {
      setCommandType('password')
    } else {
      setCommandType('text')
    }
    write(Buffer.from(data).toString(), terminalRef, smartMouseBoxRef, commandRef)
  })

}

export const enterCommand = (
  command: string,
  setCommand: Dispatch<SetStateAction<string>>
): void => {
  if (command) {
    terminalState.io?.emit('data', `${command}\r\n`)
  } else {
    terminalState.io?.emit('data', '\r\n')
  }
  setCommand('')
}

export const disconnectSocket = (): void => {
  if (!terminalState.io) return

  terminalState.io.removeAllListeners()
  terminalState.io.disconnect()
  terminalState.io = null
}
