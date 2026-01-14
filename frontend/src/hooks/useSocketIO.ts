import io, { Socket } from 'socket.io-client'
import { Buffer } from 'buffer'
import { terminalState } from './useTerminalState'
import { write } from './useTerminalEmulation'
import type { RefObject, Dispatch, SetStateAction } from 'react'

const debug = require('debug')('bbs-web')

export const setupNetwork = (
  terminalRef: RefObject<HTMLCanvasElement | null>,
  smartMouseBoxRef: RefObject<HTMLDivElement | null>,
  commandRef: RefObject<HTMLInputElement | null>,
  focusCommand: () => void,
  setCommandType: Dispatch<SetStateAction<string>>,
  setupFileTransferEvents: (io: Socket) => void
): void => {
  const host = window.location.href

  debug('Start connecting...')
  terminalState.io = io(host)

  terminalState.io.on('connect', () => {
    debug('Connected')
    focusCommand()

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
  })

  terminalState.io.on('disconnect', () => {
    debug('Disconnected')
    write('접속이 종료되었습니다.\r\n', terminalRef, smartMouseBoxRef, commandRef)
  })

  terminalState.io.on('data', (data: ArrayBuffer) => {
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

  // Setup file transfer events
  setupFileTransferEvents(terminalState.io)
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
  terminalState.io?.disconnect()
}
