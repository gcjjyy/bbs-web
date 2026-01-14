import { useState, useRef } from 'react'
import Axios from 'axios'
import type { Socket } from 'socket.io-client'
import { MAX_FILE_SIZE } from '../constants/terminalConfig'
import { formatBytes, isAsciiOnly } from '../utils/helpers'
import { terminalState } from './useTerminalState'
import type {
  RzBeginData,
  RzProgressData,
  RzEndData,
  SzBeginData,
  SzProgressData,
  SzEndData,
  UploadProgressData,
  UploadResponse,
  UseFileTransferReturn
} from '../types/fileTransfer'

function useFileTransfer(
  showNotification: (title: string, message: string) => void,
  focusCommand: () => void
): UseFileTransferReturn {
  // Download state
  const [rzDiag, setRzDiag] = useState<boolean>(false)
  const [rzDiagText, setRzDiagText] = useState<string>('')
  const [rzProgress, setRzProgress] = useState<string>('')
  const [rzProgressNow, setRzProgressNow] = useState<number>(0)
  const [rzProgressLabel, setRzProgressLabel] = useState<string>('')
  const [rzFinished, setRzFinished] = useState<boolean>(false)
  const [rzUrl, setRzUrl] = useState<string | null>(null)

  // Upload state
  const [szDiag, setSzDiag] = useState<boolean>(false)
  const [szDiagText, setSzDiagText] = useState<string>('')
  const [uploadProgress, setUploadProgress] = useState<string>('')
  const [uploadProgressNow, setUploadProgressNow] = useState<number>(0)
  const [uploadProgressLabel, setUploadProgressLabel] = useState<string>('')
  const [szProgress, setSzProgress] = useState<string>('')
  const [szProgressNow, setSzProgressNow] = useState<number>(0)
  const [szProgressLabel, setSzProgressLabel] = useState<string>('')
  const [szFinished, setSzFinished] = useState<boolean>(false)

  // File select dialog (for Safari)
  const [fileSelectDiag, setFileSelectDiag] = useState<boolean>(false)

  // Rename dialog
  const [renameDiag, setRenameDiag] = useState<boolean>(false)
  const [renameFile, setRenameFile] = useState<File | null>(null)
  const [renameInput, setRenameInput] = useState<string>('')
  const [renameExt, setRenameExt] = useState<string>('')

  // Refs for tracking filename/total during transfer
  const rzFilenameRef = useRef<string>('')
  const rzTotalRef = useRef<number>(0)
  const szFilenameRef = useRef<string>('')
  const szTotalRef = useRef<number>(0)

  const uploadFile = (file: File, overrideName: string | null = null): void => {
    // Check file size limit
    if (file.size > MAX_FILE_SIZE) {
      showNotification('파일 크기 오류', `파일 크기가 512MB를 초과합니다. (${formatBytes(file.size)})`)
      terminalState.io?.emit('sz-cancel')
      return
    }

    const fileName = overrideName || file.name
    if (!isAsciiOnly(fileName)) {
      // Show rename dialog instead of error
      const lastDot = file.name.lastIndexOf('.')
      const ext = lastDot > 0 ? file.name.substring(lastDot) : ''
      setRenameFile(file)
      setRenameExt(ext)
      setRenameInput('')
      setRenameDiag(true)
      return
    }

    // Show upload dialog immediately for HTTP upload progress
    szFilenameRef.current = fileName
    szTotalRef.current = file.size
    setSzDiag(true)
    setSzFinished(false)
    setSzDiagText(`파일 업로드: ${fileName}`)
    // Reset upload progress
    setUploadProgress('')
    setUploadProgressNow(0)
    setUploadProgressLabel('0%')
    // Reset sz progress
    setSzProgress('')
    setSzProgressNow(0)
    setSzProgressLabel('0%')

    const formData = new FormData()
    formData.append('fileToUpload', file, fileName)

    // Get socket ID for server-side progress tracking
    const socketId = terminalState.io?.id || ''
    const fileSize = szTotalRef.current

    Axios.post<UploadResponse>(`upload?socketId=${socketId}&fileSize=${fileSize}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    }).then((res) => {
      if (res.data.result) {
        // Progress continues with sz-begin event from server
        terminalState.io?.emit('sz-upload', {
          szTargetDir: res.data.szTargetDir,
          szFilename: res.data.szFilename
        })
      } else {
        showNotification('업로드 오류', '파일 업로드에 실패하였습니다.')
        setSzDiag(false)
        terminalState.io?.emit('sz-cancel')
      }
    }).catch(() => {
      showNotification('업로드 오류', '파일 업로드에 실패하였습니다.')
      setSzDiag(false)
      terminalState.io?.emit('sz-cancel')
    })
  }

  const rzClose = (): void => {
    setRzDiag(false)
    setRzFinished(false)
    setRzProgressNow(0)
    setRzProgressLabel('')
    rzFilenameRef.current = ''
    rzTotalRef.current = 0
    focusCommand()
  }

  const szClose = (): void => {
    setSzDiag(false)
    setSzFinished(false)
    setSzProgressNow(0)
    setSzProgressLabel('')
    szFilenameRef.current = ''
    szTotalRef.current = 0
    focusCommand()
  }

  const handleRenameUpload = (): void => {
    let newName = renameInput.trim()
    if (!newName) {
      showNotification('입력 오류', '파일명을 입력해주세요.')
      return
    }
    // Auto-add extension if not present
    if (renameExt && !newName.toLowerCase().endsWith(renameExt.toLowerCase())) {
      newName = newName + renameExt
    }
    // Check if new name is ASCII
    if (!isAsciiOnly(newName)) {
      showNotification('입력 오류', '영문, 숫자, 특수문자만 사용 가능합니다.')
      return
    }
    setRenameDiag(false)
    if (renameFile) {
      uploadFile(renameFile, newName)
    }
  }

  const handleRenameCancel = (): void => {
    setRenameDiag(false)
    setRenameFile(null)
    terminalState.io?.emit('sz-cancel')
  }

  // Socket event handlers for file transfer
  const setupFileTransferEvents = (io: Socket): void => {
    io.on('rz-begin', (begin: RzBeginData) => {
      rzFilenameRef.current = begin.filename
      setRzDiag(true)
      setRzFinished(false)
      setRzProgressNow(0)
      setRzProgressLabel('')
      setRzDiagText(`파일 준비중: ${begin.filename}`)
    })

    io.on('rz-progress', (progress: RzProgressData) => {
      rzTotalRef.current = progress.total
      setRzProgressNow(Math.floor((progress.received / progress.total) * 100))
      setRzProgressLabel(
        `${Math.floor((progress.received / progress.total) * 100)}%`
      )
      setRzProgress(
        `${formatBytes(progress.received)} / ${formatBytes(progress.total)}`
      )
    })

    io.on('rz-end', (result: RzEndData) => {
      if (result.code === 0) {
        setRzFinished(true)
        setRzProgressNow(100)
        setRzProgressLabel('100%')
        setRzProgress(`${formatBytes(rzTotalRef.current)} / ${formatBytes(rzTotalRef.current)}`)
        setRzDiagText(`파일 준비 완료: ${rzFilenameRef.current}`)
        setRzUrl(result.url)
      } else {
        showNotification('오류', '다운로드 실패')
      }
    })

    io.on('upload-progress', (progress: UploadProgressData) => {
      const percent = Math.round((progress.loaded / progress.total) * 100)
      setUploadProgressNow(percent)
      setUploadProgressLabel(`${percent}%`)
      setUploadProgress(`${formatBytes(progress.loaded)} / ${formatBytes(progress.total)}`)
    })

    io.on('sz-begin', (begin: SzBeginData) => {
      szFilenameRef.current = begin.filename
      setSzProgressNow(0)
      setSzProgressLabel('0%')
      setSzProgress('')
    })

    io.on('sz-progress', (progress: SzProgressData) => {
      szTotalRef.current = progress.total
      setSzProgressNow(Math.floor((progress.sent / progress.total) * 100))
      setSzProgressLabel(
        `${Math.floor((progress.sent / progress.total) * 100)}%`
      )
      setSzProgress(
        `${formatBytes(progress.sent)} / ${formatBytes(progress.total)}`
      )
    })

    io.on('sz-end', (result: SzEndData) => {
      if (result.code === 0) {
        setSzFinished(true)
        setSzProgressNow(100)
        setSzProgressLabel('100%')
        setSzProgress(`${formatBytes(szTotalRef.current)} / ${formatBytes(szTotalRef.current)}`)
        setSzDiagText(`파일 업로드 완료: ${szFilenameRef.current}`)
      } else {
        showNotification('오류', '업로드 실패')
      }
    })

    io.on('sz-request', () => {
      // Show file select dialog (for Safari compatibility - requires user gesture)
      setFileSelectDiag(true)
    })
  }

  return {
    // Download state
    rzDiag,
    rzDiagText,
    rzProgress,
    rzProgressNow,
    rzProgressLabel,
    rzFinished,
    rzUrl,
    rzClose,
    // Upload state
    szDiag,
    szDiagText,
    uploadProgress,
    uploadProgressNow,
    uploadProgressLabel,
    szProgress,
    szProgressNow,
    szProgressLabel,
    szFinished,
    szClose,
    uploadFile,
    // File select dialog
    fileSelectDiag,
    setFileSelectDiag,
    // Rename dialog
    renameDiag,
    renameExt,
    renameInput,
    setRenameInput,
    handleRenameUpload,
    handleRenameCancel,
    // Event setup
    setupFileTransferEvents
  }
}

export default useFileTransfer
