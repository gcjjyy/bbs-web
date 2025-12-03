import './App.css'
import cookies from 'browser-cookies'
import copy from 'copy-to-clipboard'
import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Nav,
  Modal,
  ProgressBar,
  Navbar,
  NavDropdown,
  OverlayTrigger,
  Tooltip,
  Form
} from 'react-bootstrap'
import io from 'socket.io-client'
import './App.scss'
import LoadingModal from './LoadingModal'
import THEMES from './themes'
import Axios from 'axios'

import { Buffer } from "buffer";
Buffer.from("anything", "base64");
window.Buffer = window.Buffer || require("buffer").Buffer;

const debug = require('debug')('bbs-web')

const CANVAS_WIDTH = 640
const CANVAS_HEIGHT = 528

const FONT_WIDTH = 8
const FONT_HEIGHT = 16
const SCREEN_HEIGHT = 33

const SMART_MOUSE_BORDER = 2

let WINDOW_TOP = 0
let WINDOW_BOTTOM = SCREEN_HEIGHT - 1

const COLOR = []
const DISPLAYS = ['VGA', 'ACI', 'HERCULES']

let _io = null
let _ctx2d = null
let _rate = 1.0
let _selectedDisplay = 'VGA'
const _selectedFont = 'IyagiGGC'
let _escape = null
let _cursor = { x: 0, y: 0 }
let _cursorStore = { x: 0, y: 0 }
let _attr = { textColor: 15, backgroundColor: 1, reversed: false }
let _lastPageText = ''
let _lastPageTextPos = []
let _smartMouse = []
let _smartMouseCmd = null

function App() {
  const [command, setCommand] = useState('')
  const [commandType, setCommandType] = useState('text')

  const [applyDiag, setApplyDiag] = useState(false)

  const [rzDiag, setRzDiag] = useState(false)
  const [rzDiagText, setRzDiagText] = useState('')
  const [rzProgress, setRzProgress] = useState('')
  // const [rzFilename, setRzFilename] = useState('')
  var rzFilename = ''
  var rzTotal = 0
  const [rzProgressNow, setRzProgressNow] = useState(0)
  const [rzProgressLabel, setRzProgressLabel] = useState('')
  const [rzFinished, setRzFinished] = useState(false)
  const [rzUrl, setRzUrl] = useState(null)

  // Upload
  var szFilename = ''
  var szTotal = 0
  const [szDiag, setSzDiag] = useState(false)
  const [szDiagText, setSzDiagText] = useState('')
  // 1단계: 브라우저 → 서버
  const [uploadProgress, setUploadProgress] = useState('')
  const [uploadProgressNow, setUploadProgressNow] = useState(0)
  const [uploadProgressLabel, setUploadProgressLabel] = useState('')
  // 2단계: 서버 → BBS
  const [szProgress, setSzProgress] = useState('')
  const [szProgressNow, setSzProgressNow] = useState(0)
  const [szProgressLabel, setSzProgressLabel] = useState('')
  const [szFinished, setSzFinished] = useState(false)

  // Notification
  const [notiDiag, setNotiDiag] = useState(false)
  const [notiDiagTitle, setNotiDiagTitle] = useState('')
  const [notiDiagText, setNotiDiagText] = useState('')

  // File select request (for Safari compatibility)
  const [fileSelectDiag, setFileSelectDiag] = useState(false)

  // File rename dialog (for non-ASCII filenames)
  const [renameDiag, setRenameDiag] = useState(false)
  const [renameFile, setRenameFile] = useState(null)
  const [renameInput, setRenameInput] = useState('')
  const [renameExt, setRenameExt] = useState('')

  const terminalRef = useRef()
  const smartMouseBoxRef = useRef()
  const commandRef = useRef()

  const fileToUploadRef = useRef()

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + units[i]
  }

  const showNotification = (title, text) => {
    setNotiDiagTitle(title)
    setNotiDiagText(text)
    setNotiDiag(true)
  }

  const notiDiagClose = () => {
    setNotiDiag(false)
  }

  const displaySelected = (display) => {
    _selectedDisplay = display
    displayChanged(false)
  }

  const onResize = () => {
    rebuildSmartMouse()
    moveCommandInputPosition()
  }

  const copyToClipboard = () => {
    if (copy(_lastPageText)) {
      showNotification('갈무리', '현재 화면이 클립보드에 복사되었습니다.')
    } else {
      showNotification('갈무리', '클립보드에 복사 중 오류가 발생하였습니다.')
    }
  }

  const terminalClicked = () => {
    commandRef.current.focus()
  }

  const mouseMove = (clientX, clientY) => {
    const mouseX = clientX - terminalRef.current.getBoundingClientRect().left
    const mouseY = clientY - terminalRef.current.getBoundingClientRect().top

    for (const sm of _smartMouse) {
      if (
        mouseX >= sm.px.x &&
        mouseY >= sm.px.y &&
        mouseX < sm.px.x + sm.px.width &&
        mouseY < sm.px.y + sm.px.height
      ) {
        // Intenally set the smart mouse command
        _smartMouseCmd = sm.command

        // Mouse smart mouse box to the position
        smartMouseBoxRef.current.style.left =
          sm.px.x -
          SMART_MOUSE_BORDER +
          terminalRef.current.getBoundingClientRect().left +
          window.pageXOffset +
          'px'
        smartMouseBoxRef.current.style.top =
          sm.px.y -
          SMART_MOUSE_BORDER +
          terminalRef.current.getBoundingClientRect().top +
          window.pageYOffset +
          'px'
        smartMouseBoxRef.current.style.width =
          sm.px.width + 2 * SMART_MOUSE_BORDER + 'px'
        smartMouseBoxRef.current.style.height =
          sm.px.height + 2 * SMART_MOUSE_BORDER + 'px'
        smartMouseBoxRef.current.style.visibility = 'visible'

        return
      }
    }

    // If no smart mouse position has detected, hide the smart mouse box
    smartMouseBoxRef.current.style.visibility = 'hidden'
  }

  const smartMouseClicked = () => {
    if (/https?:\/\//.exec(_smartMouseCmd)) {
      window.open(_smartMouseCmd, '_blank')
    } else {
      enterCommand(_smartMouseCmd)
    }

    smartMouseBoxRef.current.style.visibility = 'hidden'
    _smartMouseCmd = ''

    terminalClicked()
  }

  const onKeyUp = (key) => {
    if (key === 'Enter') {
      enterCommand(command)
    }
  }


  const screenScrollUp = () => {
    const copy = _ctx2d.getImageData(
      0,
      FONT_HEIGHT * (WINDOW_TOP + 1),
      CANVAS_WIDTH,
      FONT_HEIGHT * (WINDOW_BOTTOM - WINDOW_TOP)
    )
    _ctx2d.putImageData(copy, 0, FONT_HEIGHT * WINDOW_TOP)
    _ctx2d.fillStyle = COLOR[_attr.backgroundColor]
    _ctx2d.fillRect(0, WINDOW_BOTTOM * FONT_HEIGHT, CANVAS_WIDTH, FONT_HEIGHT)

    // Modify the position of _lastPageTextPos (scroll up)
    for (const pos of _lastPageTextPos) {
      if (pos.y >= WINDOW_TOP && pos.y <= WINDOW_BOTTOM) {
        pos.y--
      }
    }
  }

  const cr = () => {
    _cursor.x = 0
  }

  const lf = () => {
    _cursor.y++
    if (_cursor.y > WINDOW_BOTTOM) {
      _cursor.y = WINDOW_BOTTOM
      screenScrollUp()
    }
  }

  const enterCommand = (command) => {
    if (command) {
      _io.emit('data', `${command}\r\n`)
    } else {
      _io.emit('data', '\r\n')
    }
    setCommand('')
  }

  const displayChanged = (isInitial = false) => {
    for (let i = 0; i < 16; i++) {
      COLOR[i] = THEMES[_selectedDisplay][i]
    }

    _ctx2d.font = `normal 16px ${_selectedFont}`

    terminalClicked()

    cookies.set('display', _selectedDisplay, { expires: 365 })

    if (!isInitial) {
      setApplyDiag(true)

      setTimeout(() => {
        // Clear whole webpage
        document.getElementsByTagName('body')[0].style.backgroundColor =
          COLOR[_attr.backgroundColor]

        terminalRef.current.style.backgroundColor = COLOR[_attr.backgroundColor]

        // Rewrite last page text
        write(_lastPageText)
        setApplyDiag(false)

        terminalClicked()
      }, 4000)
    }
  }

  const setupTerminal = () => {
    _selectedDisplay = cookies.get('display') ?? 'VGA'

    // Value check for the prevent error by the previous value
    if (!DISPLAYS.includes(_selectedDisplay)) {
      _selectedDisplay = 'VGA'
    }

    _ctx2d = terminalRef.current.getContext('2d')
    if (_ctx2d) {
      _ctx2d.fillStyle = COLOR[_attr.textColor]
      _ctx2d.font = 'normal 16px ' + _selectedFont
      _ctx2d.textBaseline = 'top'
    } else {
      showNotification('초기화 오류', 'Canvas Context2D를 생성할 수 없습니다.')
    }

    displayChanged(true)
  }

  const MAX_FILE_SIZE = 512 * 1024 * 1024 // 512MB

  const uploadFile = (file, overrideName = null) => {
    // Check file size limit
    if (file.size > MAX_FILE_SIZE) {
      showNotification('파일 크기 오류', `파일 크기가 512MB를 초과합니다. (${formatBytes(file.size)})`)
      _io.emit('sz-cancel')
      return
    }

    const fileName = overrideName || file.name
    const isAscii = /^[\x00-\x7F]*$/.test(fileName)
    if (!isAscii) {
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
    szFilename = fileName
    szTotal = file.size
    setSzDiag(true)
    setSzFinished(false)
    setSzDiagText(`파일 업로드: ${fileName}`)
    // 1단계 progress 초기화
    setUploadProgress('')
    setUploadProgressNow(0)
    setUploadProgressLabel('0%')
    // 2단계 progress 초기화
    setSzProgress('')
    setSzProgressNow(0)
    setSzProgressLabel('0%')

    const formData = new FormData()
    formData.append('fileToUpload', file, fileName) // Use fileName for the upload

    // Get socket ID for server-side progress tracking
    const socketId = _io?.id || ''
    const fileSize = szTotal

    Axios.post(`upload?socketId=${socketId}&fileSize=${fileSize}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    }).then((res) => {
      if (res.data.result) {
        // Progress continues with sz-begin event from server
        _io.emit('sz-upload', {
          szTargetDir: res.data.szTargetDir,
          szFilename: res.data.szFilename
        })
      } else {
        showNotification('업로드 오류', '파일 업로드에 실패하였습니다.')
        setSzDiag(false)
        _io.emit('sz-cancel')
      }
    }).catch((err) => {
      showNotification('업로드 오류', '파일 업로드에 실패하였습니다.')
      setSzDiag(false)
      _io.emit('sz-cancel')
    })
  }

  const rzClose = () => {
    setRzDiag(false)
    setRzFinished(false)
    setRzProgressNow(0)
    setRzProgressLabel('')
    //setRzFilename('')
    rzFilename = ''
    rzTotal = 0
    terminalClicked()
  }

  const szClose = () => {
    setSzDiag(false)
    setSzFinished(false)
    setSzProgressNow(0)
    setSzProgressLabel('')
    //setSzFilename('')
    szFilename = ''
    szTotal = 0
    terminalClicked()
  }

  const onBeforeUnload = () => {
    _io.disconnect()
  }

  const setupNetwork = () => {
    const host = window.location.href

    debug('Start conecting...')
    _io = io(host)

    _io.on('connect', () => {
      debug('Connected')
      terminalClicked()
      _ctx2d.fillStyle = COLOR[_attr.backgroundColor]
      _ctx2d.fillRect(
        0,
        0,
        terminalRef.current.width,
        terminalRef.current.height
      )

      // Clear whole webpage
      document.getElementsByTagName('body')[0].style.backgroundColor =
        COLOR[_attr.backgroundColor]
    })

    _io.on('disconnect', () => {
      debug('Disconnected')
      write('접속이 종료되었습니다.\r\n')
    })

    _io.on('data', (data) => {
      // Check if the password input phrase
      {
        const pattern = /비밀번호 :/
        const result = pattern.exec(Buffer.from(data).toString())
        if (result) {
          setCommandType('password')
        } else {
          setCommandType('text')
        }
      }
      write(Buffer.from(data).toString())
    })

    _io.on('rz-begin', (begin) => {
      debug(`rz-begin: ${begin.filename}`)

      rzFilename = begin.filename
      setRzDiag(true)
      setRzFinished(false)
      setRzProgressNow(0)
      setRzProgressLabel('')
      setRzDiagText(`파일 준비중: ${begin.filename}`)
    })

    _io.on('rz-progress', (progress) => {
      rzTotal = progress.total
      setRzProgressNow(parseInt((progress.received / progress.total) * 100))
      setRzProgressLabel(
        `${parseInt((progress.received / progress.total) * 100)}%`
      )
      setRzProgress(
        `${formatBytes(progress.received)} / ${formatBytes(progress.total)}`
      )
    })

    _io.on('rz-end', (result) => {
      if (result.code === 0) {
        setRzFinished(true)
        setRzProgressNow(100)
        setRzProgressLabel('100%')
        setRzProgress(`${formatBytes(rzTotal)} / ${formatBytes(rzTotal)}`)
        setRzDiagText(`파일 준비 완료: ${rzFilename}`)
        setRzUrl(result.url)
      } else {
        showNotification('오류', '다운로드 실패')
      }
    })

    _io.on('upload-progress', (progress) => {
      const percent = Math.round((progress.loaded / progress.total) * 100)
      setUploadProgressNow(percent)
      setUploadProgressLabel(`${percent}%`)
      setUploadProgress(`${formatBytes(progress.loaded)} / ${formatBytes(progress.total)}`)
    })

    _io.on('sz-begin', (begin) => {
      debug(`sz-begin: ${begin.filename}`)

      szFilename = begin.filename
      setSzProgressNow(0)
      setSzProgressLabel('0%')
      setSzProgress('')
    })

    _io.on('sz-progress', (progress) => {
      szTotal = progress.total
      setSzProgressNow(parseInt((progress.sent / progress.total) * 100))
      setSzProgressLabel(
        `${parseInt((progress.sent / progress.total) * 100)}%`
      )
      setSzProgress(
        `${formatBytes(progress.sent)} / ${formatBytes(progress.total)}`
      )
    })

    _io.on('sz-end', (result) => {
      if (result.code === 0) {
        setSzFinished(true)
        setSzProgressNow(100)
        setSzProgressLabel('100%')
        setSzProgress(`${formatBytes(szTotal)} / ${formatBytes(szTotal)}`)
        setSzDiagText(`파일 업로드 완료: ${szFilename}`)
      } else {
        showNotification('오류', '업로드 실패')
      }
    })

    _io.on('sz-request', () => {
      // Show file select dialog (for Safari compatibility - requires user gesture)
      setFileSelectDiag(true)
    })
  }

  const applyEscape = () => {
    // Special block characters (from non-standard EUC-KR)
    // Pattern: ESC[=9XXB where XX is block type (01=full, 02=upper half, etc.)
    {
      const pattern = /\[=9([0-9]{2})B/
      const result = pattern.exec(_escape)
      if (result) {
        const blockType = parseInt(result[1], 10)
        const cursor_px = {
          x: _cursor.x * FONT_WIDTH,
          y: _cursor.y * FONT_HEIGHT
        }
        let textColor = COLOR[_attr.textColor]
        let backgroundColor = COLOR[_attr.backgroundColor]
        if (_attr.reversed) {
          textColor = COLOR[_attr.backgroundColor]
          backgroundColor = COLOR[_attr.textColor]
        }

        // Draw 2-column wide block (original EUC-KR char was 2-byte wide)
        const blockWidth = 2 * FONT_WIDTH
        const blockHeight = FONT_HEIGHT

        // Clear background first
        _ctx2d.fillStyle = backgroundColor
        _ctx2d.fillRect(cursor_px.x, cursor_px.y, blockWidth, blockHeight)

        // Draw the block based on type
        _ctx2d.fillStyle = textColor
        switch (blockType) {
          case 1: // Full block (901)
            _ctx2d.fillRect(cursor_px.x, cursor_px.y, blockWidth, blockHeight)
            break
          case 2: // Upper half block (902)
            _ctx2d.fillRect(cursor_px.x, cursor_px.y, blockWidth, blockHeight / 2)
            break
          case 3: // Lower half block (903)
            _ctx2d.fillRect(cursor_px.x, cursor_px.y + blockHeight / 2, blockWidth, blockHeight / 2)
            break
          case 4: // Left half block (904)
            _ctx2d.fillRect(cursor_px.x, cursor_px.y, blockWidth / 2, blockHeight)
            break
          case 5: // Right half block (905)
            _ctx2d.fillRect(cursor_px.x + blockWidth / 2, cursor_px.y, blockWidth / 2, blockHeight)
            break
          default: // Unknown block type, draw full block
            _ctx2d.fillRect(cursor_px.x, cursor_px.y, blockWidth, blockHeight)
        }

        // Advance cursor by 2 columns
        _cursor.x += 2
        return // Don't process other escape handlers
      }
    }
    // Text color
    {
      const pattern = /\[=([0-9]*)F/
      const result = pattern.exec(_escape)
      if (result) {
        const param1 = parseInt(result[1], 10)
        _attr.textColor = isNaN(param1) ? 15 : param1
      }
    }
    // Background color
    {
      const pattern = /\[=([0-9]*)G/
      const result = pattern.exec(_escape)
      if (result) {
        const param1 = parseInt(result[1], 10)
        _attr.backgroundColor = isNaN(param1) ? 1 : param1
      }
    }
    // Reverse color
    {
      const pattern = /\[([0-9;]*)m/
      const result = pattern.exec(_escape)
      if (result) {
        const attrs = result[1].split(';')
        for (const attr of attrs) {
          if (!attr || parseInt(attr, 10) == 0) {
            // Reset All Attributes
            _attr.reversed = false
            _attr.textColor = 15
            _attr.backgroundColor = 1
          } else {
            switch (parseInt(attr, 10)) {
              case 1: // Bold (not fully supported, but don't break)
                break
              case 2: // Dim (not supported)
                break
              case 4: // Underline (not supported)
                break
              case 5: // Blink (not supported)
                break
              case 7: // Reverse video on
                _attr.reversed = true
                break
              case 8: // Hidden (not supported)
                break
              case 22: // Bold/Dim off
                break
              case 24: // Underline off
                break
              case 25: // Blink off
                break
              case 27: // Reverse video off
                _attr.reversed = false
                break
              case 28: // Hidden off
                break
              case 30: _attr.textColor = 0
                break
              case 31: _attr.textColor = 4
                break
              case 32: _attr.textColor = 2
                break
              case 33: _attr.textColor = 14
                break
              case 34: _attr.textColor = 1
                break
              case 35: _attr.textColor = 5
                break
              case 36: _attr.textColor = 3
                break
              case 37: _attr.textColor = 15
                break
              case 40: _attr.backgroundColor = 0
                break
              case 41: _attr.backgroundColor = 4
                break
              case 42: _attr.backgroundColor = 2
                break
              case 43: _attr.backgroundColor = 14
                break
              case 44: _attr.backgroundColor = 1
                break
              case 45: _attr.backgroundColor = 5
                break
              case 46: _attr.backgroundColor = 3
                break
              case 47: _attr.backgroundColor = 15
                break
              // Bright foreground colors (90-97)
              case 90: _attr.textColor = 8
                break
              case 91: _attr.textColor = 12
                break
              case 92: _attr.textColor = 10
                break
              case 93: _attr.textColor = 14
                break
              case 94: _attr.textColor = 9
                break
              case 95: _attr.textColor = 13
                break
              case 96: _attr.textColor = 11
                break
              case 97: _attr.textColor = 15
                break
              // Bright background colors (100-107)
              case 100: _attr.backgroundColor = 8
                break
              case 101: _attr.backgroundColor = 12
                break
              case 102: _attr.backgroundColor = 10
                break
              case 103: _attr.backgroundColor = 14
                break
              case 104: _attr.backgroundColor = 9
                break
              case 105: _attr.backgroundColor = 13
                break
              case 106: _attr.backgroundColor = 11
                break
              case 107: _attr.backgroundColor = 15
                break
              default: _attr.reversed = false
                _attr.textColor = 15
                _attr.backgroundColor = 1
                break
            }
          }
        }
      }
    }
    // Cursor position set
    {
      // Move _cursor to specific position (H or f)
      {
        const pattern = /\[([0-9]*);([0-9]*)[Hf]/
        const result = pattern.exec(_escape)
        if (result) {
          const param1 = parseInt(result[1], 10)
          const param2 = parseInt(result[2], 10)

          _cursor.y = isNaN(param1) ? 0 : param1 - 1
          _cursor.x = isNaN(param2) ? 0 : param2 - 1
        } else {
          const pattern = /\[([0-9]*)[Hf]/
          const result = pattern.exec(_escape)
          if (result) {
            const param1 = parseInt(result[1], 10)
            _cursor.y = isNaN(param1) ? 0 : param1 - 1
            _cursor.x = 0
          }
        }
      }
      // Move _cursor y
      {
        const pattern = /\[([0-9]*)A/
        const result = pattern.exec(_escape)
        if (result) {
          const param1 = parseInt(result[1], 10)
          _cursor.y -= isNaN(param1) || param1 === 0 ? 1 : param1
          if (_cursor.y < 0) {
            _cursor.y = 0
            _cursor.x = 0
          }
        }
      }
      // Move _cursor x (Right)
      {
        const pattern = /\[([0-9]*)C/
        const result = pattern.exec(_escape)
        if (result) {
          const param1 = parseInt(result[1], 10)
          _cursor.x += isNaN(param1) || param1 === 0 ? 1 : param1
        }
      }
      // Move _cursor down
      {
        const pattern = /\[([0-9]*)B/
        const result = pattern.exec(_escape)
        if (result) {
          const param1 = parseInt(result[1], 10)
          _cursor.y += isNaN(param1) || param1 === 0 ? 1 : param1
          if (_cursor.y >= SCREEN_HEIGHT) {
            _cursor.y = SCREEN_HEIGHT - 1
          }
        }
      }
      // Move _cursor left
      {
        const pattern = /\[([0-9]*)D/
        const result = pattern.exec(_escape)
        if (result) {
          const param1 = parseInt(result[1], 10)
          _cursor.x -= isNaN(param1) || param1 === 0 ? 1 : param1
          if (_cursor.x < 0) {
            _cursor.x = 0
          }
        }
      }
      // Cursor Next Line (move to beginning of line, N lines down)
      {
        const pattern = /\[([0-9]*)E/
        const result = pattern.exec(_escape)
        if (result) {
          const param1 = parseInt(result[1], 10)
          _cursor.y += isNaN(param1) || param1 === 0 ? 1 : param1
          _cursor.x = 0
          if (_cursor.y >= SCREEN_HEIGHT) {
            _cursor.y = SCREEN_HEIGHT - 1
          }
        }
      }
      // Cursor Previous Line (move to beginning of line, N lines up)
      {
        const pattern = /\[([0-9]*)F/
        const result = pattern.exec(_escape)
        if (result) {
          const param1 = parseInt(result[1], 10)
          _cursor.y -= isNaN(param1) || param1 === 0 ? 1 : param1
          _cursor.x = 0
          if (_cursor.y < 0) {
            _cursor.y = 0
          }
        }
      }
      // Store and restore the _cursor position
      {
        if (_escape.endsWith('[s')) {
          _cursorStore = {
            x: _cursor.x,
            y: _cursor.y,
            textColor: _attr.textColor,
            backgroundColor: _attr.backgroundColor
          }
        } else if (_escape.endsWith('[u')) {
          _cursor.x = _cursorStore.x
          _cursor.y = _cursorStore.y
          _attr.textColor = _cursorStore.textColor
          _attr.backgroundColor = _cursorStore.backgroundColor
        }
      }
    }
    // Clear the screen
    {
      const pattern = /\[([0-9]*)J/
      const result = pattern.exec(_escape)
      if (result) {
        const param1 = result[1] === '' ? 0 : parseInt(result[1], 10)

        if (param1 === 2) {
          // Clear entire screen
          _ctx2d.fillStyle = COLOR[_attr.backgroundColor]
          _ctx2d.fillRect(
            0,
            0,
            terminalRef.current.width,
            terminalRef.current.height
          )

          // Clear whole webpage
          document.getElementsByTagName('body')[0].style.backgroundColor =
            COLOR[_attr.backgroundColor]

          // Refresh _lastPageText (after 2J, there is no any other text)
          _lastPageText = '\x1b[2J'
          _lastPageTextPos = [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 }
          ]
          _cursor.x = 0
          _cursor.y = 0
        } else if (param1 === 0) {
          // Clear from cursor to end of screen
          _ctx2d.fillStyle = COLOR[_attr.backgroundColor]
          // Clear from cursor to end of current line
          _ctx2d.fillRect(
            _cursor.x * FONT_WIDTH,
            _cursor.y * FONT_HEIGHT,
            terminalRef.current.width - _cursor.x * FONT_WIDTH,
            FONT_HEIGHT
          )
          // Clear all lines below cursor
          if (_cursor.y < SCREEN_HEIGHT - 1) {
            _ctx2d.fillRect(
              0,
              (_cursor.y + 1) * FONT_HEIGHT,
              terminalRef.current.width,
              terminalRef.current.height - (_cursor.y + 1) * FONT_HEIGHT
            )
          }
        } else if (param1 === 1) {
          // Clear from beginning of screen to cursor
          _ctx2d.fillStyle = COLOR[_attr.backgroundColor]
          // Clear all lines above cursor
          if (_cursor.y > 0) {
            _ctx2d.fillRect(
              0,
              0,
              terminalRef.current.width,
              _cursor.y * FONT_HEIGHT
            )
          }
          // Clear from beginning of current line to cursor
          _ctx2d.fillRect(
            0,
            _cursor.y * FONT_HEIGHT,
            (_cursor.x + 1) * FONT_WIDTH,
            FONT_HEIGHT
          )
        }
      }
    }
    // Clear a line
    {
      if (_escape.endsWith('[2K')) {
        _ctx2d.fillStyle = COLOR[_attr.backgroundColor]
        _ctx2d.fillRect(
          0,
          _cursor.y * FONT_HEIGHT,
          terminalRef.current.clientWidth,
          FONT_HEIGHT
        )
      } else if (_escape.endsWith('[1K')) {
        _ctx2d.fillStyle = COLOR[_attr.backgroundColor]
        _ctx2d.fillRect(
          0,
          _cursor.y * FONT_HEIGHT,
          (_cursor.x + 1) * FONT_WIDTH,
          FONT_HEIGHT
        )
      } else if (_escape.endsWith('[0K') || _escape.endsWith('[K')) {
        _ctx2d.fillStyle = COLOR[_attr.backgroundColor]
        _ctx2d.fillRect(
          _cursor.x * FONT_WIDTH,
          _cursor.y * FONT_HEIGHT,
          terminalRef.current.clientWidth - _cursor.x * FONT_WIDTH,
          FONT_HEIGHT
        )
      }
    }
    // Set the window area
    {
      const pattern = /\[([0-9]*);([0-9]*)r/
      const result = pattern.exec(_escape)
      if (result) {
        const param1 = parseInt(result[1], 10)
        const param2 = parseInt(result[2], 10)
        const scrollFrom = isNaN(param1) ? 0 : param1 - 1
        const scrollTo = isNaN(param2) ? 0 : param2 - 1

        // Reset the window height
        if (scrollFrom <= 0 && scrollTo <= 0) {
          WINDOW_TOP = 0
          WINDOW_BOTTOM = SCREEN_HEIGHT - 1
        } else {
          WINDOW_TOP = scrollFrom
          WINDOW_BOTTOM = scrollTo
        }
      }
    }
  }

  const endOfEscape = () => {
    if (!_escape) {
      return false
    }
    const lastChar = _escape.charAt(_escape.length - 1)
    if ('@ABCDEFGHJKSfhlmprsu'.indexOf(lastChar) !== -1) {
      return true
    } else {
      return false
    }
  }

  const rebuildSmartMouse = () => {
    _smartMouse = []
    smartMouseBoxRef.current.style.visibility = 'hidden'

    // captureOnly: true = highlight only captured group, false = highlight full match
    const smartMousePatterns = [
      { pattern: /([0-9]+)\.\s[ㄱ-힣a-z/\s]+/gi, captureOnly: false }, // 99. xx
      { pattern: /\[([0-9]+)\]\s[ㄱ-힣a-z/\s]+/gi, captureOnly: false }, // [99].xx
      { pattern: /\(([a-z]+),/gi, captureOnly: true }, // (x,
      { pattern: /,([a-z]+),/gi, captureOnly: true }, // ,x,
      { pattern: /,([a-z]+)\)/gi, captureOnly: true }, // ,x)
      { pattern: /\(([a-z]+)\)/gi, captureOnly: true }, // (x)
      { pattern: /\[([a-z0-9]+)\]/gi, captureOnly: true }, // [x]
      { pattern: /(https?:\/\/[a-z0-9-\.\/?&_=#]+)/gi, captureOnly: false }, // URL
      { pattern: /([0-9]+) +.+ +[0-9-]+ +[0-9]+ + [0-9]+ +.*/gi, captureOnly: false }, // Article
      { pattern: /([0-9]+) +[0-9\.]+ .*/gi, captureOnly: false }, // News (JTBC)
      { pattern: /([0-9]+) +.+ +[0-9-]+ .*/gi, captureOnly: false }, // News (Oh my news, IT news)
      { pattern: /([0-9]+) +(JTBC|오마이뉴스|전자신문|속보|정치|연예|전체기사|주요기사|사회|오늘의 뉴스|게임)/gi, captureOnly: false } // News Titles
    ]

    for (const { pattern, captureOnly } of smartMousePatterns) {
      var result = null
      while ((result = pattern.exec(_lastPageText))) {
        // Remove ANSI escape code
        const fullMatch = result[0].replace(/\x1b\[=.{1,3}[FG]{1}/gi, '').trim()
        const command = result[1].replace(/\x1b\[=.{1,3}[FG]{1}/gi, '').trim()

        let linkX, linkWidth
        if (captureOnly) {
          // Highlight only the captured group
          const captureOffset = result[0].indexOf(result[1])
          const captureIndex = result.index + captureOffset
          linkX = _lastPageTextPos[captureIndex].x * FONT_WIDTH * _rate
          linkWidth = _ctx2d.measureText(command).width * _rate
        } else {
          // Highlight full match
          linkX = _lastPageTextPos[result.index].x * FONT_WIDTH * _rate
          linkWidth = _ctx2d.measureText(fullMatch).width * _rate
        }

        const link = {
          command: command,
          px: {
            x: linkX,
            y: _lastPageTextPos[result.index].y * FONT_HEIGHT * _rate,
            width: linkWidth,
            height: FONT_HEIGHT * _rate
          }
        }
        _smartMouse.push(link)
      }
    }

    // Remove overlapping smart mouse areas on the same line, keep the leftmost one
    const filtered = []
    for (const sm of _smartMouse) {
      let dominated = false
      for (const other of filtered) {
        // Check if on the same line
        if (sm.px.y === other.px.y) {
          // Check if overlapping
          const smRight = sm.px.x + sm.px.width
          const otherRight = other.px.x + other.px.width
          if (!(smRight <= other.px.x || sm.px.x >= otherRight)) {
            // Overlapping: keep only the leftmost one
            if (other.px.x <= sm.px.x) {
              dominated = true
              break
            }
          }
        }
      }
      if (!dominated) {
        // Also remove any existing items that this one dominates (if sm is more left)
        for (let i = filtered.length - 1; i >= 0; i--) {
          const other = filtered[i]
          if (sm.px.y === other.px.y) {
            const smRight = sm.px.x + sm.px.width
            const otherRight = other.px.x + other.px.width
            if (!(smRight <= other.px.x || sm.px.x >= otherRight)) {
              if (sm.px.x < other.px.x) {
                filtered.splice(i, 1)
              }
            }
          }
        }
        filtered.push(sm)
      }
    }
    _smartMouse = filtered
  }

  const moveCommandInputPosition = () => {
    const bcr = terminalRef.current.getBoundingClientRect()

    _rate = bcr.width / CANVAS_WIDTH
    const scaledCursorX = _cursor.x * FONT_WIDTH * _rate
    const scaledCursorY = _cursor.y * FONT_HEIGHT * _rate

    const tmLeft = bcr.left + window.pageXOffset
    const tmTop = bcr.top + window.pageYOffset
    const tmWidth = bcr.width

    const cmLeft = tmLeft + scaledCursorX
    const cmTop = tmTop + scaledCursorY - (20 - 16 * _rate) / 2
    const cmWidth = tmWidth - (cmLeft - tmLeft)

    commandRef.current.style.left = `${cmLeft}px`
    commandRef.current.style.top = `${cmTop}px`
    commandRef.current.style.width = `${cmWidth}px`

    commandRef.current.style.fontSize = `${16 * _rate}px`
    commandRef.current.style.height = '20px'
  }

  const write = (text) => {
    for (const ch of text) {
      _lastPageText += ch
      _lastPageTextPos.push({ x: _cursor.x, y: _cursor.y })
      if (_escape) {
        _escape = _escape + ch
        if (endOfEscape()) {
          applyEscape()
          _escape = null
        }
      } else {
        switch (ch.charCodeAt(0)) {
          case 27:
            _escape = '\x1b'
            break

          case 13:
            cr()
            break

          case 10:
            lf()
            break

          case 0: // NULL
          case 24: // ZDLE
          case 17: // XON
          case 138: // LF of sz
          case 65533: // Unknown
            break

          default:
            {
              const charWidth = ch.charCodeAt(0) < 0x80 ? 1 : 2
              const cursor_px = {
                x: _cursor.x * FONT_WIDTH,
                y: _cursor.y * FONT_HEIGHT
              }
              let textColor = COLOR[_attr.textColor]
              let backgroundColor = COLOR[_attr.backgroundColor]

              if (_attr.reversed) {
                textColor = COLOR[_attr.backgroundColor]
                backgroundColor = COLOR[_attr.textColor]
              }

              _ctx2d.fillStyle = backgroundColor
              _ctx2d.fillRect(
                cursor_px.x,
                cursor_px.y,
                charWidth * FONT_WIDTH,
                FONT_HEIGHT
              )
              _ctx2d.fillStyle = textColor
              _ctx2d.fillText(ch, cursor_px.x, cursor_px.y)

              _cursor.x += charWidth
            }
            break
        }
      }
    }

    // Rebuild smart mouse
    rebuildSmartMouse()

    // Move the command textfield to the _cursor position
    moveCommandInputPosition()
  }

  useEffect(() => {
    debug('Setup')

    setupTerminal()
    setupNetwork()
    window.addEventListener('resize', onResize)
    window.addEventListener('beforeunload', onBeforeUnload)

    return () => {
      window.removeEventListener('resize', this.onResize)
      window.removeEventListener('beforeunload', this.onBeforeUnload)
    }
  }, [])

  return (
    <div>
      <Navbar>
        <Navbar.Brand>
          <span style={{ color: 'yellow' }}>도</span>
          <span style={{ color: 'white' }}>/</span>
          <span style={{ color: 'red' }}>스</span>
          <span style={{ color: 'white' }}>/</span>
          <span style={{ color: 'cyan' }}>박</span>
          <span style={{ color: 'white' }}>/</span>
          <span style={{ color: 'lightgreen' }}>물</span>
          <span style={{ color: 'white' }}>/</span>
          <span style={{ color: 'yellow' }}>관</span>
        </Navbar.Brand>
        <Nav
          className="mr-auto"
          onSelect={(selectedKey) => displaySelected(selectedKey)}
        >
          <NavDropdown title="🎨 테마">
            {DISPLAYS.map((display) => (
              <NavDropdown.Item key={display} eventKey={display}>
                {display}
              </NavDropdown.Item>
            ))}
          </NavDropdown>
        </Nav>
        <div className="nav-buttons">
          <OverlayTrigger
            placement="bottom"
            overlay={<Tooltip>화면 갈무리</Tooltip>}
          >
            <Button variant="secondary" onClick={() => copyToClipboard()}>
              📋 갈무리
            </Button>
          </OverlayTrigger>
        </div>
      </Navbar>
      <div className="text-center mt-3">
        <canvas
          ref={terminalRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-100"
          style={{ maxWidth: '700px' }}
          onClick={() => terminalClicked()}
          onMouseMove={(event) => mouseMove(event.clientX, event.clientY)}
        ></canvas>
        <div
          ref={smartMouseBoxRef}
          className="smart-mouse-box"
          onClick={() => smartMouseClicked()}
        ></div>
        <input
          ref={commandRef}
          type="text"
          className={commandType === 'password' ? 'command command-password' : 'command'}
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          onKeyUp={(event) => onKeyUp(event.key)}
          autoComplete="off"
        />
      </div>
      <div className="text-center mt-3">
        <a href="mailto:gcjjyy@gmail.com">© 2019 QuickBASIC (gcjjyy@gmail.com)</a>
      </div>

      {/* Modal for Download */}
      <Modal show={rzDiag} size="xs" backdrop="static" centered>
        <Modal.Header>{rzDiagText}</Modal.Header>
        <Modal.Body className="text-center m-4">
          {rzProgress}
          <ProgressBar animated now={rzProgressNow} label={rzProgressLabel} />
        </Modal.Body>
        {rzFinished && (
          <div className="text-center m-3">
            <a href={rzUrl} download>
              <Button className="w-50 mr-3">다운로드</Button>
            </a>
            <Button onClick={() => rzClose()}>닫기</Button>
          </div>
        )}
      </Modal>

      {/* Modal for Upload */}
      <Modal show={szDiag} size="xs" backdrop="static" centered>
        <Modal.Header>{szDiagText}</Modal.Header>
        <Modal.Body className="m-4">
          <div className="mb-3">
            <div className="d-flex justify-content-between mb-1">
              <small>웹 서버로 전송</small>
              <small>{uploadProgress}</small>
            </div>
            <ProgressBar
              striped
              animated
              now={uploadProgressNow}
              label={uploadProgressLabel}
              variant="info"
              className="progress-striped-bg"
            />
          </div>
          <div>
            <div className="d-flex justify-content-between mb-1">
              <small>BBS로 전송</small>
              <small>{szProgress}</small>
            </div>
            <ProgressBar
              striped
              animated
              now={szProgressNow}
              label={szProgressLabel}
              variant="success"
              className="progress-striped-bg"
            />
          </div>
        </Modal.Body>
        {szFinished && (
          <div className="text-center m-3">
            <Button onClick={() => szClose()}>확인</Button>
          </div>
        )}
      </Modal>

      {/* Modal Notification */}
      <Modal show={notiDiag} size="xs" backdrop="static" centered>
        <Modal.Header>{notiDiagTitle}</Modal.Header>
        <Modal.Body className="text-center m-4" style={{ whiteSpace: 'pre-line' }}>{notiDiagText}</Modal.Body>
        <div className="text-center m-3">
          <Button onClick={() => notiDiagClose()}>확인</Button>
        </div>
      </Modal>

      {/* Hidden input for upload */}
      <input
        type="file"
        name="fileToUpload"
        ref={fileToUploadRef}
        hidden
        onChange={(e) => {
          if (e.target.files.length) {
            uploadFile(e.target.files[0])
          }
        }}
      />

      {/* Modal for File Select Request (Safari compatibility) */}
      <Modal show={fileSelectDiag} size="xs" backdrop="static" centered>
        <Modal.Header>파일 업로드</Modal.Header>
        <Modal.Body className="text-center m-4">업로드할 파일을 선택해주세요.</Modal.Body>
        <div className="text-center m-3">
          <Button className="mr-2" onClick={() => {
            setFileSelectDiag(false)
            fileToUploadRef.current.value = ''
            fileToUploadRef.current.click()
          }}>파일 선택</Button>
          <Button variant="secondary" onClick={() => {
            setFileSelectDiag(false)
            _io.emit('sz-cancel')
          }}>취소</Button>
        </div>
      </Modal>

      {/* Modal for File Rename (non-ASCII filename) */}
      <Modal show={renameDiag} size="sm" backdrop="static" centered>
        <Modal.Header>파일명 변경</Modal.Header>
        <Modal.Body className="m-3">
          <p>파일명에 한글이 포함되어 있습니다.<br/>영문 파일명을 입력해주세요.</p>
          <Form.Group>
            <Form.Label>새 파일명 {renameExt && <span className="text-muted">({renameExt} 자동 추가)</span>}</Form.Label>
            <Form.Control
              type="text"
              placeholder="영문 파일명 입력"
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  // Trigger upload button click
                  document.getElementById('rename-upload-btn').click()
                }
              }}
            />
          </Form.Group>
        </Modal.Body>
        <div className="text-center m-3">
          <Button id="rename-upload-btn" className="mr-2" onClick={() => {
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
            const isAscii = /^[\x00-\x7F]*$/.test(newName)
            if (!isAscii) {
              showNotification('입력 오류', '영문, 숫자, 특수문자만 사용 가능합니다.')
              return
            }
            setRenameDiag(false)
            uploadFile(renameFile, newName)
          }}>업로드</Button>
          <Button variant="secondary" onClick={() => {
            setRenameDiag(false)
            setRenameFile(null)
            _io.emit('sz-cancel')
          }}>취소</Button>
        </div>
      </Modal>

      <LoadingModal show={applyDiag} message="적용 중입니다.." />
    </div>
  )
}

export default App
