const fs = require('fs')
const net = require('net')
const mkdir = require('mkdirp-sync')
const http = require('http')
const spawn = require('child_process').spawn
const uuidv1 = require('uuid').v1
const iconv = require('iconv-lite')
const express = require('express')
const execSync = require('child_process').execSync
const Busboy = require('busboy')

const { TelnetSocket } = require('telnet-stream')
require('console-stamp')(console, 'yyyy/mm/dd HH:MM:ss.l')

// EUC-KR special block characters mapping
// These non-standard characters are replaced with custom escape sequences
// that survive iconv decoding and can be handled on the client side
// Format: { from: [hi, lo], escCode: 'XXX' } -> becomes ESC[=XXXB
const EUC_KR_BLOCK_REPLACEMENTS = [
  // 0xADFC -> Full Block (fills entire 16x16 cell)
  { from: [0xAD, 0xFC], escCode: '901' },
  // 0xADFD -> Lower Half Block
  { from: [0xAD, 0xFD], escCode: '903' },
  // 0xAEA2 -> Upper Half Block
  { from: [0xAE, 0xA2], escCode: '902' }
]

// Preprocess buffer to replace special EUC-KR block characters
// Replaces with: ESC [ = XXX B (e.g., \x1b[=901B)
// This is ASCII, survives iconv, and can be detected by client's applyEscape()
const preprocessBlockChars = (buffer) => {
  const result = []
  let i = 0
  while (i < buffer.length) {
    let replaced = false
    // Check for 2-byte EUC-KR sequences
    if (i + 1 < buffer.length) {
      for (const { from, escCode } of EUC_KR_BLOCK_REPLACEMENTS) {
        if (buffer[i] === from[0] && buffer[i + 1] === from[1]) {
          // Insert escape sequence: ESC [ = XXX B
          const seq = `\x1b[=${escCode}B`
          for (const c of seq) {
            result.push(c.charCodeAt(0))
          }
          i += 2
          replaced = true
          break
        }
      }
    }
    if (!replaced) {
      result.push(buffer[i])
      i++
    }
  }
  return Buffer.from(result)
}

const ECHO = 1
const TERMINAL_TYPE = 24
const WINDOW_SIZE = 31
const WILL_OPTIONS = [ECHO, TERMINAL_TYPE, WINDOW_SIZE]

const app = express()

// File upload is handled by busboy in the /upload endpoint
app.use(express.static(process.cwd() + '/frontend/build'))

const httpServer = http.createServer(app)
const io = require('socket.io')(httpServer, {
  cors: {
    origin: '*'
  }
})

// const BBS_ADDR = 'bbs.thelast.co.kr'
// const BBS_PORT = 23
const BBS_ADDR = 'bbs.olddos.kr'
const BBS_PORT = 9000

const fileCacheDir = process.cwd() + '/frontend/build/file-cache/'

io.on('connection', function (ioSocket) {
  console.log('Client connected:', ioSocket.client.conn.remoteAddress)

  // Remain data to be parsed
  var remain = []

  // Create client TCP Socket
  ioSocket.netSocket = net.createConnection(BBS_PORT, BBS_ADDR)

  // Create Telnet Procotol Stream
  ioSocket.tSocket = new TelnetSocket(ioSocket.netSocket)

  // Generate the decode stream
  ioSocket.tSocket.decodeStream = iconv.decodeStream('euc-kr')
  ioSocket.tSocket.decodeStream.on('data', (data) => {
    ioSocket.emit('data', Buffer.from(data))
  })

  ioSocket.tSocket.on('do', (option) => {
    if (WILL_OPTIONS.includes(option)) {
      ioSocket.tSocket.writeWill(option)

      if (option == TERMINAL_TYPE) {
        ioSocket.tSocket.writeSub(TERMINAL_TYPE, Buffer.from('VT100'))
      }
    } else {
      ioSocket.tSocket.writeWont(option)
    }
  })

  ioSocket.tSocket.on('close', () => {
    console.log('BBS disconnected:', ioSocket.client.conn.remoteAddress)
    ioSocket.disconnect(true)
  })

  // Handling data from the telnet stream
  ioSocket.tSocket.on('data', (buffer) => {
    if (ioSocket.rzTransmit) {
      ioSocket.rz.stdin.write(Buffer.from(buffer))
    } else if (ioSocket.szTransmit) {
      ioSocket.sz.stdin.write(Buffer.from(buffer))
    } else {
      // Preprocess to replace special EUC-KR block characters before decoding
      const processedBuffer = preprocessBlockChars(buffer)
      ioSocket.tSocket.decodeStream.write(processedBuffer)

      // Check rz
      {
        const pattern = /B00000000000000/
        const result = pattern.exec(buffer.toString())
        if (result) {
          // Create temporary for file download using uuid
          ioSocket.rzTargetDir = uuidv1()
          mkdir(fileCacheDir + ioSocket.rzTargetDir)

          ioSocket.rzTransmit = true

          ioSocket.rz = spawn('rz', ['-e', '-E', '-vv'], {
            cwd: fileCacheDir + ioSocket.rzTargetDir,
            setsid: true
          })

          ioSocket.rz.stdout.on('data', (data) => {
            ioSocket.tSocket.write(data)
          })

          ioSocket.rz.stderr.on('data', (data) => {
            const decodedString = iconv.decode(Buffer.from(data), 'euc-kr')
            {
              const pattern = /Receiving: (.*)/
              const result = pattern.exec(decodedString)
              if (result) {
                ioSocket.rzFilename = result[1]
                ioSocket.emit('rz-begin', { filename: ioSocket.rzFilename })
              }
            }
            {
              const pattern =
                /Bytes received: ([0-9 ]*)\/([0-9 ]*).*BPS:([0-9 ]*)/gi

              let result = null
              while ((result = pattern.exec(decodedString))) {
                if (result) {
                  const received = parseInt(result[1], 10)
                  const total = parseInt(result[2], 10)
                  const bps = parseInt(result[3], 10)

                  ioSocket.emit('rz-progress', { received, total, bps })
                }
              }
            }
          })

          ioSocket.rz.on('close', (code) => {
            console.log('rz closed:', code)
            ioSocket.rzTransmit = false
            execSync('find . -type f -exec mv -f {} "' + ioSocket.rzFilename + '" 2> /dev/null \\;', {
              cwd:
                fileCacheDir +
                ioSocket.rzTargetDir
            })
            const url = '/file-cache/' + ioSocket.rzTargetDir + '/' + ioSocket.rzFilename;
            console.log('rz-end url:', url)
            ioSocket.emit('rz-end', {
              code,
              url,
            })
            console.log('rz-end emit done')
          })
        }
      }

      // Check sz - request file from client when B0100 detected
      {
        const pattern = /B0100/
        const result = pattern.exec(buffer.toString())
        if (result) {
          // Only send sz-request if not already waiting for file selection
          if (!ioSocket.szWaiting) {
            console.log('B0100 detected, requesting file from client')
            ioSocket.szWaiting = true
            ioSocket.emit('sz-request', {})
          } else {
            console.log('B0100 detected but already waiting for file selection, ignoring')
          }
        }
      }

      // Auto-select Zmodem protocol (send '3' automatically)
      {
        const bufferStr = iconv.decode(buffer, 'euc-kr')
        const pattern = /송신 프로토콜\(1:Xmodem, 2:Ymodem, 3:Zmodem\):/
        const result = pattern.exec(bufferStr)
        if (result) {
          console.log('Protocol selection detected, auto-sending 3 for Zmodem')
          ioSocket.tSocket.write(iconv.encode('3\r\n', 'euc-kr'))
        }
      }
    }
  })

  ioSocket.on('data', (data) => {
    ioSocket.tSocket.write(iconv.encode(Buffer.from(data), 'euc-kr'))
  })

  // Handle upload start signal from client
  ioSocket.on('sz-upload', (data) => {
    console.log('sz-upload:', data)

    if (ioSocket.szWaiting) {
      ioSocket.szWaiting = false
      ioSocket.szTransmit = true

      ioSocket.sz = spawn('sz', [data.szFilename, '-e', '-E', '-vv'], {
        cwd: fileCacheDir + data.szTargetDir,
        setsid: true
      })

      ioSocket.sz.stdout.on('data', (szData) => {
        ioSocket.tSocket.write(szData)
      })

      ioSocket.sz.stderr.on('data', (szData) => {
        const decodedString = szData.toString()
        console.log('[sz stderr]', decodedString)
        {
          const pattern = /Sending: (.*)/
          const result = pattern.exec(decodedString)
          if (result) {
            console.log('[sz] Sending detected:', result[1])
            ioSocket.emit('sz-begin', { filename: data.szFilename })
          }
        }
        {
          const pattern =
            /Bytes Sent:\s*([0-9]+)\/([0-9]+).*BPS:\s*([0-9]+)/gi

          let result = null
          while ((result = pattern.exec(decodedString))) {
            if (result) {
              const sent = parseInt(result[1], 10)
              const total = parseInt(result[2], 10)
              const bps = parseInt(result[3], 10)

              console.log('[sz] Progress:', sent, '/', total, 'BPS:', bps)
              ioSocket.emit('sz-progress', { sent, total, bps })
            }
          }
        }
      })

      ioSocket.sz.on('close', (code) => {
        ioSocket.szTransmit = false
        ioSocket.emit('sz-end', { code })
      })
    }
  })

  // Handle upload cancel from client
  ioSocket.on('sz-cancel', () => {
    console.log('sz-cancel: user cancelled file selection')
    if (ioSocket.szWaiting) {
      ioSocket.szWaiting = false
      // Send abort packet to BBS
      const abortPacket = [
        24, 24, 24, 24, 24, 24, 24, 24, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 0
      ]
      ioSocket.netSocket.write(Buffer.from(abortPacket))
    }
  })

  ioSocket.on('error', (error) => {
    console.log('Client error:', error)
  })

  ioSocket.on('disconnect', () => {
    console.log('Client disconnected:', ioSocket.client.conn.remoteAddress)
    ioSocket.netSocket.destroy()
  })

})

// File upload with progress tracking via busboy
const MAX_FILE_SIZE = 512 * 1024 * 1024 // 512MB

app.post('/upload', function (req, res) {
  const socketId = req.query.socketId
  const fileSize = parseInt(req.query.fileSize, 10) || 0

  console.log(`[Upload] Request received - socketId: ${socketId}, fileSize: ${fileSize}`)

  const busboy = Busboy({
    headers: req.headers,
    limits: { fileSize: MAX_FILE_SIZE }
  })

  let szTargetDir = null
  let szFilename = null
  let filePath = null
  let writeStream = null
  let receivedBytes = 0
  let lastProgressTime = 0
  let dataEventCount = 0

  busboy.on('file', (fieldname, file, info) => {
    const { filename } = info
    szFilename = filename
    szTargetDir = uuidv1()

    const dir = fileCacheDir + szTargetDir
    mkdir(dir)

    filePath = dir + '/' + szFilename
    writeStream = fs.createWriteStream(filePath)

    console.log(`[Upload] File stream started: ${szFilename}`)

    file.on('data', (data) => {
      receivedBytes += data.length
      dataEventCount++
      writeStream.write(data)

      // Emit progress every 50ms or on first event
      const now = Date.now()
      if (socketId && fileSize && (dataEventCount === 1 || now - lastProgressTime > 50)) {
        lastProgressTime = now
        io.to(socketId).emit('upload-progress', {
          loaded: receivedBytes,
          total: fileSize
        })
      }
    })

    file.on('end', () => {
      writeStream.end()
      // Send final progress
      if (socketId && fileSize) {
        io.to(socketId).emit('upload-progress', {
          loaded: receivedBytes,
          total: fileSize
        })
      }
      console.log(`Upload finished: ${szFilename} (${receivedBytes} bytes)`)
    })

    file.on('limit', () => {
      console.log('File size limit exceeded')
      writeStream.end()
      fs.unlinkSync(filePath)
    })
  })

  busboy.on('finish', () => {
    if (szFilename && szTargetDir) {
      res.send({
        result: true,
        szTargetDir,
        szFilename
      })
    } else {
      res.status(400).send({ result: false, error: 'No file uploaded' })
    }
  })

  busboy.on('error', (err) => {
    console.error('Busboy error:', err)
    res.status(500).send({ result: false, error: err.message })
  })

  req.pipe(busboy)
})

console.log('Listening...')

httpServer.listen(8199, '0.0.0.0')
