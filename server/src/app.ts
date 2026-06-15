import * as http from 'http'
import express from 'express'
import { Server } from 'socket.io'
import Iconv from 'iconv'

import { SERVER_PORT, SERVER_HOST } from './constants'
import { createTelnetConnection, sendToBBS } from './telnet'
import { handleBBSData } from './zmodem'
import type { ExtendedSocket } from './types'

// Timestamp logger
const timestamp = () => new Date().toISOString().replace('T', ' ').substring(0, 23)
const log = (msg: string) => console.log(`[${timestamp()}] ${msg}`)

// Express app setup
const app = express()
const staticPath = import.meta.dir + '/../../frontend/build'
app.use(express.static(staticPath))
app.use(express.json())

// Filename encoding API for ZMODEM (using native iconv for CP949)
const utf8ToCp949 = new Iconv.Iconv('UTF-8', 'CP949')

app.post('/api/encode-filename', (req, res) => {
  const { filename } = req.body
  if (!filename) {
    res.status(400).json({ error: 'filename required' })
    return
  }

  // macOS uses NFD (decomposed) for filenames, but CP949 needs NFC (composed)
  const normalizedFilename = filename.normalize('NFC')

  try {
    const encoded = utf8ToCp949.convert(Buffer.from(normalizedFilename, 'utf8'))
    res.json({ encoded: Array.from(encoded) })
  } catch (e) {
    console.error('[Encode] Error:', e)
    res.status(500).json({ error: 'encoding failed' })
  }
})

// HTTP server and Socket.IO setup
const httpServer = http.createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: '*'
  },
  // Force WebSocket transport for better performance and real-time progress
  transports: ['websocket', 'polling'],
  // Allow upgrade from polling to websocket
  allowUpgrades: true
})

// Socket.IO connection handler
io.on('connection', (socket) => {
  const ioSocket = socket as ExtendedSocket
  log(`Client connected: ${ioSocket.client.conn.remoteAddress}`)

  // Create telnet connection to BBS
  try {
    createTelnetConnection(ioSocket)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log(`Failed to create BBS connection: ${message}`)
    ioSocket.emit('bbs-error', { message: 'Unable to connect to BBS' })
    ioSocket.disconnect(true)
    return
  }

  if (!ioSocket.tSocket) {
    log('Failed to create BBS connection: telnet socket unavailable')
    ioSocket.emit('bbs-error', { message: 'Unable to connect to BBS' })
    ioSocket.disconnect(true)
    return
  }

  // Handle data from BBS
  ioSocket.tSocket.on('data', (buffer: unknown) => {
    handleBBSData(ioSocket, buffer as Buffer)
  })

  // Handle data from client (send to BBS)
  ioSocket.on('data', (data: string | Buffer | ArrayBuffer) => {
    // Convert ArrayBuffer to Buffer if needed
    const bufferData = data instanceof ArrayBuffer ? Buffer.from(data) : data
    sendToBBS(ioSocket, bufferData)
  })

  // Handle ZMODEM session end from browser
  ioSocket.on('zmodem-end', () => {
    log('Browser ZMODEM session ended')
    ioSocket.zmodemActive = false
  })

  ioSocket.on('zmodem-cancel', () => {
    log('Browser ZMODEM session cancelled')
    ioSocket.zmodemActive = false
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

// Start server
log('Starting server...')
httpServer.listen(SERVER_PORT, SERVER_HOST, () => {
  log(`Server listening on ${SERVER_HOST}:${SERVER_PORT}`)
})
