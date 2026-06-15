import './App.css'
import './App.scss'
import { Buffer } from 'buffer'
import cookies from 'browser-cookies'
import copy from 'copy-to-clipboard'
import { useEffect, useRef, useState, ChangeEvent } from 'react'
import LoadingModal from './LoadingModal'
import {
  BOX_DRAWING_FONT,
  DEFAULT_FONT,
  DISPLAYS
} from './constants/terminalConfig'
import Navigation from './components/Navigation'
import TerminalCanvas from './components/TerminalCanvas'
import {
  DownloadModal,
  UploadModal,
  NotificationModal,
  FileSelectModal
} from './components/modals'
import { terminalState, initializeColors } from './hooks/useTerminalState'
import { handleMouseMove, handleSmartMouseClick, rebuildSmartMouse } from './hooks/useSmartMouse'
import {
  moveCommandInputPosition,
  replayTerminalHistory
} from './hooks/useTerminalEmulation'
import { setupNetwork, enterCommand, disconnectSocket, setDataInterceptor } from './hooks/useSocketIO'
import useZmodem from './hooks/useZmodem'
import type { ThemeName } from './themes'
import { getTerminalCanvasFont } from './utils/terminalFont'

Buffer.from('anything', 'base64')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(window as any).Buffer = (window as any).Buffer || Buffer

const debug = require('debug')('bbs-web')

function App() {
  const [command, setCommand] = useState<string>('')
  const [commandType, setCommandType] = useState<string>('text')
  const [applyDiag, setApplyDiag] = useState<boolean>(false)

  // Notification state
  const [notiDiag, setNotiDiag] = useState<boolean>(false)
  const [notiDiagTitle, setNotiDiagTitle] = useState<string>('')
  const [notiDiagText, setNotiDiagText] = useState<string>('')

  // Refs
  const terminalRef = useRef<HTMLCanvasElement>(null)
  const smartMouseBoxRef = useRef<HTMLDivElement>(null)
  const commandRef = useRef<HTMLInputElement>(null)
  const fileToUploadRef = useRef<HTMLInputElement>(null)

  // Notification handlers
  const showNotification = (title: string, text: string): void => {
    setNotiDiagTitle(title)
    setNotiDiagText(text)
    setNotiDiag(true)
  }

  const notiDiagClose = (): void => {
    setNotiDiag(false)
  }

  // Focus command input
  const focusCommand = (): void => {
    commandRef.current?.focus()
  }

  // Browser-side ZMODEM hook
  const zmodem = useZmodem(showNotification, focusCommand)

  // Set up ZMODEM data interceptor
  useEffect(() => {
    setDataInterceptor(zmodem.processIncomingData)
    return () => {
      setDataInterceptor(null)
    }
  }, [zmodem.processIncomingData])

  // Display/theme handling
  const displaySelected = (display: string | null): void => {
    if (display) {
      terminalState.selectedDisplay = display
      displayChanged(false)
    }
  }

  const displayChanged = (isInitial: boolean = false): void => {
    initializeColors(terminalState.selectedDisplay as ThemeName)
    if (terminalState.ctx2d) {
      terminalState.ctx2d.font = getTerminalCanvasFont(DEFAULT_FONT)
    }
    focusCommand()
    cookies.set('display', terminalState.selectedDisplay, { expires: 365 })

    if (!isInitial) {
      setApplyDiag(true)
      setTimeout(() => {
        document.getElementsByTagName('body')[0].style.backgroundColor =
          terminalState.COLOR[terminalState.attr.backgroundColor]
        if (terminalRef.current) {
          terminalRef.current.style.backgroundColor =
            terminalState.COLOR[terminalState.attr.backgroundColor]
        }
        replayTerminalHistory(terminalRef, smartMouseBoxRef, commandRef)
        setApplyDiag(false)
        focusCommand()
      }, 4000)
    }
  }

  const setupTerminal = (): void => {
    terminalState.selectedDisplay = cookies.get('display') ?? 'VGA'
    document.fonts?.load(getTerminalCanvasFont(DEFAULT_FONT))
    document.fonts?.load(getTerminalCanvasFont(BOX_DRAWING_FONT))

    // Validate display value
    if (!DISPLAYS.includes(terminalState.selectedDisplay)) {
      terminalState.selectedDisplay = 'VGA'
    }

    if (terminalRef.current) {
      terminalState.ctx2d = terminalRef.current.getContext('2d')
      if (terminalState.ctx2d) {
        initializeColors(terminalState.selectedDisplay as ThemeName)
        terminalState.ctx2d.fillStyle = terminalState.COLOR[terminalState.attr.textColor]
        terminalState.ctx2d.font = getTerminalCanvasFont(DEFAULT_FONT)
        terminalState.ctx2d.textBaseline = 'top'
      } else {
        showNotification('초기화 오류', 'Canvas Context2D를 생성할 수 없습니다.')
      }
    }

    displayChanged(true)
  }

  // Clipboard
  const copyToClipboard = (): void => {
    if (copy(terminalState.lastPageText)) {
      showNotification('갈무리', '현재 화면이 클립보드에 복사되었습니다.')
    } else {
      showNotification('갈무리', '클립보드에 복사 중 오류가 발생하였습니다.')
    }
  }

  // Event handlers
  const onResize = (): void => {
    rebuildSmartMouse(smartMouseBoxRef)
    moveCommandInputPosition(terminalRef, commandRef)
  }

  const onKeyUp = (key: string): void => {
    if (key === 'Enter') {
      enterCommand(command, setCommand)
    }
  }

  const mouseMove = (clientX: number, clientY: number): void => {
    handleMouseMove(clientX, clientY, terminalRef, smartMouseBoxRef)
  }

  const smartMouseClicked = (): void => {
    handleSmartMouseClick(smartMouseBoxRef, (cmd: string) => enterCommand(cmd, setCommand))
    focusCommand()
  }

  const handleFileSelect = (): void => {
    zmodem.closeFileSelectDialog()
    if (fileToUploadRef.current) {
      fileToUploadRef.current.value = ''
      fileToUploadRef.current.click()
    }
  }

  const handleFileSelectCancel = (): void => {
    zmodem.cancelFileSelect()
    zmodem.cancelTransfer()
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    if (e.target.files && e.target.files.length) {
      zmodem.startUpload(Array.from(e.target.files))
    }
  }

  // Lifecycle
  useEffect(() => {
    debug('Setup')

    setupTerminal()
    setupNetwork(
      terminalRef,
      smartMouseBoxRef,
      commandRef,
      focusCommand,
      setCommandType
    )
    window.addEventListener('resize', onResize)
    window.addEventListener('beforeunload', disconnectSocket)

    return () => {
      setDataInterceptor(null)
      disconnectSocket()
      window.removeEventListener('resize', onResize)
      window.removeEventListener('beforeunload', disconnectSocket)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <Navigation
        onDisplaySelect={displaySelected}
        onCopyToClipboard={copyToClipboard}
      />

      <TerminalCanvas
        ref={terminalRef}
        commandRef={commandRef}
        smartMouseBoxRef={smartMouseBoxRef}
        command={command}
        commandType={commandType}
        onTerminalClick={focusCommand}
        onMouseMove={mouseMove}
        onSmartMouseClick={smartMouseClicked}
        onCommandChange={setCommand}
        onKeyUp={onKeyUp}
      />

      <div className="text-center mt-3">
        <a href="mailto:gcjjyy@gmail.com">© 2019 QuickBASIC (gcjjyy@gmail.com)</a>
      </div>

      <DownloadModal
        show={zmodem.state.rzDiag}
        diagText={zmodem.state.rzDiagText}
        progress={zmodem.state.rzProgress}
        progressNow={zmodem.state.rzProgressNow}
        progressLabel={zmodem.state.rzProgressLabel}
        finished={zmodem.state.rzFinished}
        url={null}
        onClose={zmodem.closeDownloadDialog}
        onDownload={zmodem.downloadFile}
        useBrowserZmodem={true}
      />

      <UploadModal
        show={zmodem.state.szDiag}
        diagText={zmodem.state.szDiagText}
        uploadProgress=""
        uploadProgressNow={0}
        uploadProgressLabel=""
        szProgress={zmodem.state.szProgress}
        szProgressNow={zmodem.state.szProgressNow}
        szProgressLabel={zmodem.state.szProgressLabel}
        finished={zmodem.state.szFinished}
        onClose={zmodem.closeUploadDialog}
        useBrowserZmodem={true}
      />

      <NotificationModal
        show={notiDiag}
        title={notiDiagTitle}
        text={notiDiagText}
        onClose={notiDiagClose}
      />

      <input
        type="file"
        name="fileToUpload"
        ref={fileToUploadRef}
        hidden
        onChange={handleFileChange}
      />

      <FileSelectModal
        show={zmodem.state.szFileSelectDiag}
        onSelect={handleFileSelect}
        onCancel={handleFileSelectCancel}
      />

      <LoadingModal show={applyDiag} message="적용 중입니다.." />
    </div>
  )
}

export default App
