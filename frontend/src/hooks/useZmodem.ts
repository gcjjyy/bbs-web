/**
 * ZMODEM Hook for React - Pure TypeScript Version
 *
 * Provides ZMODEM file transfer integration using pure TypeScript implementation.
 * Detects ZMODEM patterns in incoming data and handles file transfers
 * directly in the browser without server-side processing.
 */

import { useState, useRef, useCallback } from 'react'
import { formatBytes, createProgressThrottle } from '../utils/helpers'
import { terminalState } from './useTerminalState'
import { ZmodemReceiver, ZmodemSender, encodeCancelSequence } from '../zmodem'
import type { FileInfo, FileToSend } from '../zmodem'

// ZMODEM detection patterns
const RZ_DETECT_PATTERN = /B00000000000000/
const SZ_DETECT_PATTERN = /B0100/

export interface ZmodemHookState {
  // Session state
  isActive: boolean
  mode: 'idle' | 'receiving' | 'sending'

  // Download state
  rzDiag: boolean
  rzDiagText: string
  rzProgress: string
  rzProgressNow: number
  rzProgressLabel: string
  rzFinished: boolean
  rzFileData: Uint8Array | null
  rzFileName: string | null

  // Upload state
  szFileSelectDiag: boolean  // Show file selection dialog
  szDiag: boolean
  szDiagText: string
  szProgress: string
  szProgressNow: number
  szProgressLabel: string
  szFinished: boolean
}

export interface UseZmodemReturn {
  // State
  state: ZmodemHookState

  // Actions
  processIncomingData: (data: ArrayBuffer) => boolean
  startUpload: (files: File[]) => Promise<void>
  cancelTransfer: () => void
  closeDownloadDialog: () => void
  closeUploadDialog: () => void
  closeFileSelectDialog: () => void
  cancelFileSelect: () => void
  downloadFile: () => void

  // Detection
  isZmodemActive: () => boolean
}

export function useZmodem(
  showNotification: (title: string, message: string) => void,
  focusCommand: () => void
): UseZmodemReturn {
  // ZMODEM receiver/sender refs
  const receiverRef = useRef<ZmodemReceiver | null>(null)
  const senderRef = useRef<ZmodemSender | null>(null)

  // State
  const [isActive, setIsActive] = useState(false)
  const [mode, setMode] = useState<'idle' | 'receiving' | 'sending'>('idle')

  // Download state
  const [rzDiag, setRzDiag] = useState(false)
  const [rzDiagText, setRzDiagText] = useState('')
  const [rzProgress, setRzProgress] = useState('')
  const [rzProgressNow, setRzProgressNow] = useState(0)
  const [rzProgressLabel, setRzProgressLabel] = useState('')
  const [rzFinished, setRzFinished] = useState(false)
  const [rzFileData, setRzFileData] = useState<Uint8Array | null>(null)
  const [rzFileName, setRzFileName] = useState<string | null>(null)

  // Upload state
  const [szFileSelectDiag, setSzFileSelectDiag] = useState(false)
  const [szDiag, setSzDiag] = useState(false)
  const [szDiagText, setSzDiagText] = useState('')
  const [szProgress, setSzProgress] = useState('')
  const [szProgressNow, setSzProgressNow] = useState(0)
  const [szProgressLabel, setSzProgressLabel] = useState('')
  const [szFinished, setSzFinished] = useState(false)

  // Store initial ZRINIT data when upload trigger is detected
  const pendingZrinitRef = useRef<Uint8Array | null>(null)

  // Throttle progress re-renders: chunks arrive every 8KB, which means
  // thousands of state updates for large files
  const progressThrottleRef = useRef(createProgressThrottle(100))

  // Create receiver instance
  const createReceiver = useCallback(() => {
    const receiver = new ZmodemReceiver({
      onSend: (data: Uint8Array) => {
        // Send data back to server
        if (terminalState.io) {
          const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
          terminalState.io.emit('data', buffer)
        }
      },

      onFileStart: (info: FileInfo) => {
        console.log(`[ZMODEM] File start: ${info.name}, size=${info.size}`)
        setRzDiagText(`파일 수신 중: ${info.name}`)
        setRzFileName(info.name)
      },

      onProgress: (received: number, total: number) => {
        if (total > 0 && progressThrottleRef.current(received, total)) {
          const pct = Math.floor((received / total) * 100)
          setRzProgressNow(pct)
          setRzProgressLabel(`${pct}%`)
          setRzProgress(`${formatBytes(received)} / ${formatBytes(total)}`)
        }
      },

      onFileComplete: (info: FileInfo, data: Uint8Array) => {
        console.log(`[ZMODEM] File complete: ${info.name}, size=${data.length}`)

        // Copy data to ensure it's not a view
        const dataCopy = new Uint8Array(data.length)
        dataCopy.set(data)

        setRzFileData(dataCopy)
        setRzFileName(info.name)
        setRzFinished(true)
        setRzProgressNow(100)
        setRzProgressLabel('100%')
        setRzProgress(`${formatBytes(data.length)} / ${formatBytes(data.length)}`)
        setRzDiagText('다운로드 완료!')
      },

      onSessionComplete: () => {
        console.log('[ZMODEM] Session complete')
        receiverRef.current = null
        setIsActive(false)
        setMode('idle')
        // Notify server that ZMODEM session ended
        if (terminalState.io) {
          terminalState.io.emit('zmodem-end')
        }
      },

      onError: (error: string) => {
        console.error('[ZMODEM] Error:', error)
        receiverRef.current = null
        showNotification('ZMODEM 오류', error)
        setIsActive(false)
        setMode('idle')
        setRzDiag(false)
      }
    })

    return receiver
  }, [showNotification])

  // Create sender instance
  const createSender = useCallback(() => {
    const sender = new ZmodemSender({
      onSend: (data: Uint8Array) => {
        // Send data to server
        if (terminalState.io) {
          const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
          terminalState.io.emit('data', buffer)
        }
      },

      onProgress: (sent: number, total: number) => {
        if (total > 0 && progressThrottleRef.current(sent, total)) {
          const pct = Math.floor((sent / total) * 100)
          setSzProgressNow(pct)
          setSzProgressLabel(`${pct}%`)
          setSzProgress(`${formatBytes(sent)} / ${formatBytes(total)}`)
        }
      },

      onFileComplete: (name: string) => {
        console.log(`[ZMODEM] File sent: ${name}`)
      },

      onSessionComplete: () => {
        console.log('[ZMODEM] Send session complete')
        senderRef.current = null
        setSzFinished(true)
        setSzDiagText('업로드 완료!')
        setIsActive(false)
        setMode('idle')
        // Notify server that ZMODEM session ended
        if (terminalState.io) {
          terminalState.io.emit('zmodem-end')
        }
      },

      onError: (error: string) => {
        console.error('[ZMODEM] Send error:', error)
        senderRef.current = null
        showNotification('ZMODEM 오류', error)
        setIsActive(false)
        setMode('idle')
        setSzDiag(false)
      }
    })

    return sender
  }, [showNotification])

  // Process incoming data
  const processIncomingData = useCallback((data: ArrayBuffer): boolean => {
    const bytes = new Uint8Array(data)

    // If receiver is active, route all data to ZMODEM receiver
    // Check ref directly to avoid stale state issues
    if (receiverRef.current) {
      receiverRef.current.processData(bytes)
      return true
    }

    // If sender is active, route all data to ZMODEM sender
    // Check ref directly to avoid stale state issues
    if (senderRef.current) {
      senderRef.current.processData(bytes)
      return true
    }

    // Check for ZMODEM patterns
    const textData = new TextDecoder('latin1').decode(bytes)

    // Check for download trigger (remote wants to send file)
    if (RZ_DETECT_PATTERN.test(textData)) {
      console.log('[ZMODEM] Download trigger detected')

      // Create and start receiver
      const receiver = createReceiver()
      receiverRef.current = receiver

      setIsActive(true)
      setMode('receiving')
      setRzDiag(true)
      setRzFinished(false)
      setRzProgressNow(0)
      setRzProgressLabel('')
      setRzProgress('')
      setRzDiagText('ZMODEM 다운로드 대기 중...')
      setRzFileData(null)
      setRzFileName(null)

      // Start receiver and process initial data
      receiver.start()
      receiver.processData(bytes)

      return true
    }

    // Check for upload trigger (remote ready to receive)
    if (SZ_DETECT_PATTERN.test(textData)) {
      console.log('[ZMODEM] Upload trigger detected')
      // Store the initial ZRINIT data to feed to sender later
      pendingZrinitRef.current = new Uint8Array(bytes)
      // Show file selection dialog
      setSzFileSelectDiag(true)
      // Don't consume the data - let the user see the prompt
      return false
    }

    return false
  }, [createReceiver])

  // Start upload with files
  const startUpload = useCallback(async (files: File[]) => {
    if (files.length === 0) {
      showNotification('오류', '업로드할 파일을 선택해주세요.')
      return
    }

    // Close file select dialog
    setSzFileSelectDiag(false)

    // Show upload progress dialog
    setSzDiag(true)
    setSzFinished(false)
    setSzProgressNow(0)
    setSzProgressLabel('')
    setSzProgress('')
    setSzDiagText('파일 준비 중...')

    try {
      // Read files into memory and get EUC-KR encoded filenames from server
      const filesToSend: FileToSend[] = []
      for (const file of files) {
        const buffer = await file.arrayBuffer()

        // Get CP949 encoded filename from server
        let encodedName: Uint8Array | undefined
        try {
          const response = await fetch('/api/encode-filename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: file.name })
          })
          if (response.ok) {
            const data = await response.json()
            encodedName = new Uint8Array(data.encoded)
          }
        } catch {
          // Fallback to UTF-8 if encoding fails
        }

        filesToSend.push({
          name: file.name,
          encodedName,
          data: new Uint8Array(buffer),
          mtime: Math.floor(file.lastModified / 1000)
        })
      }

      // Create sender and start
      const sender = createSender()
      senderRef.current = sender

      setIsActive(true)
      setMode('sending')
      setSzDiagText(`업로드 중: ${filesToSend[0].name}`)

      // Start sending
      sender.start(filesToSend)

      // Feed the pending ZRINIT data that triggered the upload
      if (pendingZrinitRef.current) {
        sender.processData(pendingZrinitRef.current)
        pendingZrinitRef.current = null
      }
    } catch (error) {
      console.error('[ZMODEM] Upload error:', error)
      showNotification('오류', '파일을 읽는 중 오류가 발생했습니다.')
      setSzDiag(false)
    }
  }, [showNotification, createSender])

  // Cancel current transfer
  const cancelTransfer = useCallback(() => {
    // Send cancel sequence
    if (terminalState.io) {
      const cancelSeq = encodeCancelSequence()
      const buffer = cancelSeq.buffer.slice(cancelSeq.byteOffset, cancelSeq.byteOffset + cancelSeq.byteLength)
      terminalState.io.emit('data', buffer)
      // Notify server that ZMODEM session ended
      terminalState.io.emit('zmodem-end')
    }

    receiverRef.current = null
    senderRef.current = null
    setIsActive(false)
    setMode('idle')
    setRzDiag(false)
    setSzDiag(false)
  }, [])

  // Close download dialog
  const closeDownloadDialog = useCallback(() => {
    setRzDiag(false)
    setRzFinished(false)
    setRzProgressNow(0)
    setRzProgressLabel('')
    setRzFileData(null)
    setRzFileName(null)
    receiverRef.current = null
    // Send enter to refresh terminal screen
    if (terminalState.io) {
      terminalState.io.emit('data', '\r\n')
    }
    focusCommand()
  }, [focusCommand])

  // Close upload dialog
  const closeUploadDialog = useCallback(() => {
    setSzDiag(false)
    setSzFinished(false)
    setSzProgressNow(0)
    setSzProgressLabel('')
    senderRef.current = null
    // Send enter to refresh terminal screen
    if (terminalState.io) {
      terminalState.io.emit('data', '\r\n')
    }
    focusCommand()
  }, [focusCommand])

  // Close file select dialog (called when user clicks "파일 선택" button)
  const closeFileSelectDialog = useCallback(() => {
    setSzFileSelectDiag(false)
    // Don't clear pendingZrinitRef here - it's needed by startUpload
    focusCommand()
  }, [focusCommand])

  // Cancel file select (called when user clicks "취소" button)
  const cancelFileSelect = useCallback(() => {
    setSzFileSelectDiag(false)
    pendingZrinitRef.current = null
    focusCommand()
  }, [focusCommand])

  // Download the received file
  const downloadFile = useCallback(() => {
    if (rzFileData && rzFileName) {
      // Create blob and download
      const buffer = new ArrayBuffer(rzFileData.length)
      new Uint8Array(buffer).set(rzFileData)
      const blob = new Blob([buffer], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = rzFileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      // Send enter to refresh terminal screen
      if (terminalState.io) {
        terminalState.io.emit('data', '\r\n')
      }
    }
  }, [rzFileData, rzFileName])

  // Check if ZMODEM is active
  const isZmodemActive = useCallback(() => {
    return isActive
  }, [isActive])

  return {
    state: {
      isActive,
      mode,
      rzDiag,
      rzDiagText,
      rzProgress,
      rzProgressNow,
      rzProgressLabel,
      rzFinished,
      rzFileData,
      rzFileName,
      szFileSelectDiag,
      szDiag,
      szDiagText,
      szProgress,
      szProgressNow,
      szProgressLabel,
      szFinished
    },
    processIncomingData,
    startUpload,
    cancelTransfer,
    closeDownloadDialog,
    closeUploadDialog,
    closeFileSelectDialog,
    cancelFileSelect,
    downloadFile,
    isZmodemActive
  }
}

export default useZmodem
