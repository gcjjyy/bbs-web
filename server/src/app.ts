import * as fs from 'fs'
import * as http from 'http'
import express from 'express'
import { Server } from 'socket.io'
import Busboy from 'busboy'
import { v1 as uuidv1 } from 'uuid'

import { SERVER_PORT, SERVER_HOST, MAX_FILE_SIZE } from './constants'
import { createTelnetConnection, sendToBBS } from './telnet'
import { handleBBSData, startSzUpload, cancelSzUpload, getFileCacheDir } from './zmodem'
import type { ExtendedSocket, UploadResponse } from './types'

// Timestamp logger
const timestamp = () => new Date().toISOString().replace('T', ' ').substring(0, 23)
const log = (msg: string) => console.log(`[${timestamp()}] ${msg}`)

// Express app setup
const app = express()
const staticPath = import.meta.dir + '/../../frontend/build'
app.use(express.static(staticPath))

// HTTP server and Socket.IO setup
const httpServer = http.createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: '*'
  }
})

const fileCacheDir = getFileCacheDir()

// Socket.IO connection handler
io.on('connection', (socket) => {
  const ioSocket = socket as ExtendedSocket
  log(`Client connected: ${ioSocket.client.conn.remoteAddress}`)

  // Create telnet connection to BBS
  createTelnetConnection(ioSocket)

  // Handle data from BBS
  ioSocket.tSocket.on('data', (buffer: unknown) => {
    handleBBSData(ioSocket, buffer as Buffer)
  })

  // Handle data from client (send to BBS)
  ioSocket.on('data', (data: string | Buffer) => {
    sendToBBS(ioSocket, data)
  })

  // Handle upload start signal from client
  ioSocket.on('sz-upload', (data: { szFilename: string; szTargetDir: string }) => {
    startSzUpload(ioSocket, data)
  })

  // Handle upload cancel from client
  ioSocket.on('sz-cancel', () => {
    cancelSzUpload(ioSocket)
  })

  // Handle socket errors
  ioSocket.on('error', (error: Error) => {
    log(`Client error: ${error.message}`)
  })

  // Handle client disconnection
  ioSocket.on('disconnect', () => {
    log(`Client disconnected: ${ioSocket.client.conn.remoteAddress}`)
    if (ioSocket.netSocket) {
      ioSocket.netSocket.destroy()
    }
  })
})

// File upload endpoint with progress tracking
app.post('/upload', (req, res) => {
  const socketId = req.query.socketId as string | undefined
  const fileSize = parseInt(req.query.fileSize as string, 10) || 0

  const busboy = Busboy({
    headers: req.headers,
    limits: { fileSize: MAX_FILE_SIZE }
  })

  let szTargetDir: string | null = null
  let szFilename: string | null = null
  let filePath: string | null = null
  let writeStream: fs.WriteStream | null = null
  let receivedBytes = 0
  let lastProgressTime = 0
  let dataEventCount = 0

  busboy.on('file', (fieldname, file, info) => {
    const { filename } = info
    szFilename = filename
    szTargetDir = uuidv1()

    const dir = fileCacheDir + szTargetDir
    fs.mkdirSync(dir, { recursive: true })

    filePath = dir + '/' + szFilename
    writeStream = fs.createWriteStream(filePath)

    file.on('data', (data: Buffer) => {
      receivedBytes += data.length
      dataEventCount++
      writeStream?.write(data)

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
      writeStream?.end()
      // Send final progress
      if (socketId && fileSize) {
        io.to(socketId).emit('upload-progress', {
          loaded: receivedBytes,
          total: fileSize
        })
      }
    })

    file.on('limit', () => {
      log('File size limit exceeded')
      writeStream?.end()
      if (filePath) {
        try {
          fs.unlinkSync(filePath)
        } catch {
          // Ignore unlink errors
        }
      }
    })
  })

  busboy.on('finish', () => {
    const response: UploadResponse = szFilename && szTargetDir
      ? { result: true, szTargetDir, szFilename }
      : { result: false, error: 'No file uploaded' }

    if (response.result) {
      res.json(response)
    } else {
      res.status(400).json(response)
    }
  })

  busboy.on('error', (err: Error) => {
    log(`Busboy error: ${err.message}`)
    res.status(500).json({ result: false, error: err.message } as UploadResponse)
  })

  req.pipe(busboy)
})

// Start server
log('Starting server...')
httpServer.listen(SERVER_PORT, SERVER_HOST, () => {
  log(`Server listening on ${SERVER_HOST}:${SERVER_PORT}`)
})
