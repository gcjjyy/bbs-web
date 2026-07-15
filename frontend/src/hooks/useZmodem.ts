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

// Longest trigger pattern is 15 chars, so 14 tail chars are enough to
// complete a pattern split across two data events
const DETECT_TAIL_LENGTH = 14

interface SessionState {
  isActive: boolean
  mode: 'idle' | 'receiving' | 'sending'
}

interface DownloadState {
  dialog: boolean
  text: string
  progress: string
  progressNow: number
  progressLabel: string
  finished: boolean
  fileBlob: Blob | null
  fileName: string | null
}

interface UploadState {
  fileSelectDialog: boolean
  dialog: boolean
  text: string
  progress: string
  progressNow: number
  progressLabel: string
  finished: boolean
}

const IDLE_SESSION: SessionState = { isActive: false, mode: 'idle' }

const INITIAL_DOWNLOAD: DownloadState = {
  dialog: false,
  text: '',
  progress: '',
  progressNow: 0,
  progressLabel: '',
  finished: false,
  fileBlob: null,
  fileName: null
}

const INITIAL_UPLOAD: UploadState = {
  fileSelectDialog: false,
  dialog: false,
  text: '',
  progress: '',
  progressNow: 0,
  progressLabel: '',
  finished: false
}

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
  rzFileBlob: Blob | null
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

  // State, grouped by concern
  const [session, setSession] = useState<SessionState>(IDLE_SESSION)
  const [rz, setRz] = useState<DownloadState>(INITIAL_DOWNLOAD)
  const [sz, setSz] = useState<UploadState>(INITIAL_UPLOAD)

  // Store initial ZRINIT data when upload trigger is detected
  const pendingZrinitRef = useRef<Uint8Array | null>(null)

  // Throttle progress re-renders: chunks arrive every 8KB, which means
  // thousands of state updates for large files
  const progressThrottleRef = useRef(createProgressThrottle(100))

  // Tail of the previous data event, for triggers split across packets
  const detectTailRef = useRef('')

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
        setRz((prev) => ({
          ...prev,
          text: `파일 수신 중: ${info.name}`,
          fileName: info.name
        }))
      },

      onProgress: (received: number, total: number) => {
        if (total > 0 && progressThrottleRef.current(received, total)) {
          const pct = Math.floor((received / total) * 100)
          setRz((prev) => ({
            ...prev,
            progressNow: pct,
            progressLabel: `${pct}%`,
            progress: `${formatBytes(received)} / ${formatBytes(total)}`
          }))
        }
      },

      onFileComplete: (info: FileInfo, chunks: Uint8Array[]) => {
        // Build the Blob straight from the received chunks; no
        // intermediate contiguous copy of the whole file is needed
        const blob = new Blob(chunks as BlobPart[], {
          type: 'application/octet-stream'
        })
        console.log(`[ZMODEM] File complete: ${info.name}, size=${blob.size}`)

        setRz((prev) => ({
          ...prev,
          fileBlob: blob,
          fileName: info.name,
          finished: true,
          progressNow: 100,
          progressLabel: '100%',
          progress: `${formatBytes(blob.size)} / ${formatBytes(blob.size)}`,
          text: '다운로드 완료!'
        }))
      },

      onSessionComplete: () => {
        console.log('[ZMODEM] Session complete')
        receiverRef.current = null
        setSession(IDLE_SESSION)
        // Notify server that ZMODEM session ended
        if (terminalState.io) {
          terminalState.io.emit('zmodem-end')
        }
      },

      onError: (error: string) => {
        console.error('[ZMODEM] Error:', error)
        receiverRef.current = null
        showNotification('ZMODEM 오류', error)
        setSession(IDLE_SESSION)
        setRz((prev) => ({ ...prev, dialog: false }))
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
          setSz((prev) => ({
            ...prev,
            progressNow: pct,
            progressLabel: `${pct}%`,
            progress: `${formatBytes(sent)} / ${formatBytes(total)}`
          }))
        }
      },

      onFileComplete: (name: string) => {
        console.log(`[ZMODEM] File sent: ${name}`)
      },

      onSessionComplete: () => {
        console.log('[ZMODEM] Send session complete')
        senderRef.current = null
        setSz((prev) => ({ ...prev, finished: true, text: '업로드 완료!' }))
        setSession(IDLE_SESSION)
        // Notify server that ZMODEM session ended
        if (terminalState.io) {
          terminalState.io.emit('zmodem-end')
        }
      },

      onError: (error: string) => {
        console.error('[ZMODEM] Send error:', error)
        senderRef.current = null
        showNotification('ZMODEM 오류', error)
        setSession(IDLE_SESSION)
        setSz((prev) => ({ ...prev, dialog: false }))
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

    // Check for ZMODEM patterns, joining the previous event's tail so
    // triggers split across packets are still detected
    const textData =
      detectTailRef.current + new TextDecoder('latin1').decode(bytes)

    // Check for download trigger (remote wants to send file)
    if (RZ_DETECT_PATTERN.test(textData)) {
      console.log('[ZMODEM] Download trigger detected')
      detectTailRef.current = ''

      // Create and start receiver
      const receiver = createReceiver()
      receiverRef.current = receiver

      setSession({ isActive: true, mode: 'receiving' })
      setRz({ ...INITIAL_DOWNLOAD, dialog: true, text: 'ZMODEM 다운로드 대기 중...' })

      // Start receiver and process initial data
      receiver.start()
      receiver.processData(bytes)

      return true
    }

    // Check for upload trigger (remote ready to receive)
    if (SZ_DETECT_PATTERN.test(textData)) {
      console.log('[ZMODEM] Upload trigger detected')
      detectTailRef.current = ''
      // Store the initial ZRINIT data to feed to sender later
      pendingZrinitRef.current = new Uint8Array(bytes)
      // Show file selection dialog
      setSz((prev) => ({ ...prev, fileSelectDialog: true }))
      // Don't consume the data - let the user see the prompt
      return false
    }

    detectTailRef.current = textData.slice(-DETECT_TAIL_LENGTH)
    return false
  }, [createReceiver])

  // Start upload with files
  const startUpload = useCallback(async (files: File[]) => {
    if (files.length === 0) {
      showNotification('오류', '업로드할 파일을 선택해주세요.')
      return
    }

    // Close file select dialog, show upload progress dialog
    setSz({ ...INITIAL_UPLOAD, dialog: true, text: '파일 준비 중...' })

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

      setSession({ isActive: true, mode: 'sending' })
      setSz((prev) => ({ ...prev, text: `업로드 중: ${filesToSend[0].name}` }))

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
      setSz((prev) => ({ ...prev, dialog: false }))
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
    setSession(IDLE_SESSION)
    setRz((prev) => ({ ...prev, dialog: false }))
    setSz((prev) => ({ ...prev, dialog: false }))
  }, [])

  // Close download dialog
  const closeDownloadDialog = useCallback(() => {
    setRz(INITIAL_DOWNLOAD)
    receiverRef.current = null
    // Send enter to refresh terminal screen
    if (terminalState.io) {
      terminalState.io.emit('data', '\r\n')
    }
    focusCommand()
  }, [focusCommand])

  // Close upload dialog
  const closeUploadDialog = useCallback(() => {
    setSz((prev) => ({
      ...INITIAL_UPLOAD,
      fileSelectDialog: prev.fileSelectDialog
    }))
    senderRef.current = null
    // Send enter to refresh terminal screen
    if (terminalState.io) {
      terminalState.io.emit('data', '\r\n')
    }
    focusCommand()
  }, [focusCommand])

  // Close file select dialog (called when user clicks "파일 선택" button)
  const closeFileSelectDialog = useCallback(() => {
    setSz((prev) => ({ ...prev, fileSelectDialog: false }))
    // Don't clear pendingZrinitRef here - it's needed by startUpload
    focusCommand()
  }, [focusCommand])

  // Cancel file select (called when user clicks "취소" button)
  const cancelFileSelect = useCallback(() => {
    setSz((prev) => ({ ...prev, fileSelectDialog: false }))
    pendingZrinitRef.current = null
    focusCommand()
  }, [focusCommand])

  // Download the received file
  const downloadFile = useCallback(() => {
    if (rz.fileBlob && rz.fileName) {
      const url = URL.createObjectURL(rz.fileBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = rz.fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      // Send enter to refresh terminal screen
      if (terminalState.io) {
        terminalState.io.emit('data', '\r\n')
      }
    }
  }, [rz.fileBlob, rz.fileName])

  // Check if ZMODEM is active
  const isZmodemActive = useCallback(() => {
    return session.isActive
  }, [session.isActive])

  return {
    state: {
      isActive: session.isActive,
      mode: session.mode,
      rzDiag: rz.dialog,
      rzDiagText: rz.text,
      rzProgress: rz.progress,
      rzProgressNow: rz.progressNow,
      rzProgressLabel: rz.progressLabel,
      rzFinished: rz.finished,
      rzFileBlob: rz.fileBlob,
      rzFileName: rz.fileName,
      szFileSelectDiag: sz.fileSelectDialog,
      szDiag: sz.dialog,
      szDiagText: sz.text,
      szProgress: sz.progress,
      szProgressNow: sz.progressNow,
      szProgressLabel: sz.progressLabel,
      szFinished: sz.finished
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
