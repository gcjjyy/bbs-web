import './App.css'
import './App.scss'
import { Buffer } from 'buffer'
import cookies from 'browser-cookies'
import copy from 'copy-to-clipboard'
import { useEffect, useRef, useState, ChangeEvent } from 'react'
import LoadingModal from './LoadingModal'
import { DISPLAYS, DEFAULT_FONT } from './constants/terminalConfig'
import Navigation from './components/Navigation'
import TerminalCanvas from './components/TerminalCanvas'
import {
  DownloadModal,
  UploadModal,
  NotificationModal,
  FileSelectModal,
  RenameModal
} from './components/modals'
import { terminalState, initializeColors } from './hooks/useTerminalState'
import { handleMouseMove, handleSmartMouseClick, rebuildSmartMouse } from './hooks/useSmartMouse'
import { write, moveCommandInputPosition } from './hooks/useTerminalEmulation'
import { setupNetwork, enterCommand, disconnectSocket, setDataInterceptor } from './hooks/useSocketIO'
import useFileTransfer from './hooks/useFileTransfer'
import useZmodem from './hooks/useZmodem'
import type { ThemeName } from './themes'

// Configuration: Use browser-side ZMODEM (true) or server-side lrzsz (false)
const USE_BROWSER_ZMODEM = true

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

  // File transfer hook (for server-side ZMODEM fallback)
  const fileTransfer = useFileTransfer(showNotification, focusCommand)

  // Browser-side ZMODEM hook
  const zmodem = useZmodem(showNotification, focusCommand)

  // Set up ZMODEM data interceptor
  useEffect(() => {
    if (USE_BROWSER_ZMODEM) {
      setDataInterceptor(zmodem.processIncomingData)
    }
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
      terminalState.ctx2d.font = `normal 16px ${DEFAULT_FONT}`
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
        write(terminalState.lastPageText, terminalRef, smartMouseBoxRef, commandRef)
        setApplyDiag(false)
        focusCommand()
      }, 4000)
    }
  }

  const setupTerminal = (): void => {
    terminalState.selectedDisplay = cookies.get('display') ?? 'VGA'

    // Validate display value
    if (!DISPLAYS.includes(terminalState.selectedDisplay)) {
      terminalState.selectedDisplay = 'VGA'
    }

    if (terminalRef.current) {
      terminalState.ctx2d = terminalRef.current.getContext('2d')
      if (terminalState.ctx2d) {
        initializeColors(terminalState.selectedDisplay as ThemeName)
        terminalState.ctx2d.fillStyle = terminalState.COLOR[terminalState.attr.textColor]
        terminalState.ctx2d.font = `normal 16px ${DEFAULT_FONT}`
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
    if (USE_BROWSER_ZMODEM) {
      zmodem.closeFileSelectDialog()
    } else {
      fileTransfer.setFileSelectDiag(false)
    }
    if (fileToUploadRef.current) {
      fileToUploadRef.current.value = ''
      fileToUploadRef.current.click()
    }
  }

  const handleFileSelectCancel = (): void => {
    if (USE_BROWSER_ZMODEM) {
      zmodem.cancelFileSelect()
      zmodem.cancelTransfer()
    } else {
      fileTransfer.setFileSelectDiag(false)
      terminalState.io?.emit('sz-cancel')
    }
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    if (e.target.files && e.target.files.length) {
      if (USE_BROWSER_ZMODEM) {
        // Use browser-side ZMODEM
        zmodem.startUpload(Array.from(e.target.files))
      } else {
        // Use server-side ZMODEM (legacy)
        fileTransfer.uploadFile(e.target.files[0])
      }
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
      setCommandType,
      // Only set up server-side file transfer events if not using browser ZMODEM
      USE_BROWSER_ZMODEM ? undefined : fileTransfer.setupFileTransferEvents
    )
    window.addEventListener('resize', onResize)
    window.addEventListener('beforeunload', disconnectSocket)

    return () => {
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
        show={USE_BROWSER_ZMODEM ? zmodem.state.rzDiag : fileTransfer.rzDiag}
        diagText={USE_BROWSER_ZMODEM ? zmodem.state.rzDiagText : fileTransfer.rzDiagText}
        progress={USE_BROWSER_ZMODEM ? zmodem.state.rzProgress : fileTransfer.rzProgress}
        progressNow={USE_BROWSER_ZMODEM ? zmodem.state.rzProgressNow : fileTransfer.rzProgressNow}
        progressLabel={USE_BROWSER_ZMODEM ? zmodem.state.rzProgressLabel : fileTransfer.rzProgressLabel}
        finished={USE_BROWSER_ZMODEM ? zmodem.state.rzFinished : fileTransfer.rzFinished}
        url={USE_BROWSER_ZMODEM ? null : fileTransfer.rzUrl}
        onClose={USE_BROWSER_ZMODEM ? zmodem.closeDownloadDialog : fileTransfer.rzClose}
        onDownload={USE_BROWSER_ZMODEM ? zmodem.downloadFile : undefined}
        useBrowserZmodem={USE_BROWSER_ZMODEM}
      />

      <UploadModal
        show={USE_BROWSER_ZMODEM ? zmodem.state.szDiag : fileTransfer.szDiag}
        diagText={USE_BROWSER_ZMODEM ? zmodem.state.szDiagText : fileTransfer.szDiagText}
        uploadProgress={USE_BROWSER_ZMODEM ? '' : fileTransfer.uploadProgress}
        uploadProgressNow={USE_BROWSER_ZMODEM ? 0 : fileTransfer.uploadProgressNow}
        uploadProgressLabel={USE_BROWSER_ZMODEM ? '' : fileTransfer.uploadProgressLabel}
        szProgress={USE_BROWSER_ZMODEM ? zmodem.state.szProgress : fileTransfer.szProgress}
        szProgressNow={USE_BROWSER_ZMODEM ? zmodem.state.szProgressNow : fileTransfer.szProgressNow}
        szProgressLabel={USE_BROWSER_ZMODEM ? zmodem.state.szProgressLabel : fileTransfer.szProgressLabel}
        finished={USE_BROWSER_ZMODEM ? zmodem.state.szFinished : fileTransfer.szFinished}
        onClose={USE_BROWSER_ZMODEM ? zmodem.closeUploadDialog : fileTransfer.szClose}
        useBrowserZmodem={USE_BROWSER_ZMODEM}
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
        show={USE_BROWSER_ZMODEM ? zmodem.state.szFileSelectDiag : fileTransfer.fileSelectDiag}
        onSelect={handleFileSelect}
        onCancel={handleFileSelectCancel}
      />

      <RenameModal
        show={fileTransfer.renameDiag}
        renameExt={fileTransfer.renameExt}
        renameInput={fileTransfer.renameInput}
        setRenameInput={fileTransfer.setRenameInput}
        onUpload={fileTransfer.handleRenameUpload}
        onCancel={fileTransfer.handleRenameCancel}
      />

      <LoadingModal show={applyDiag} message="적용 중입니다.." />
    </div>
  )
}

export default App
