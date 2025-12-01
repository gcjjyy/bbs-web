# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

bbs-web is a web-based BBS (Bulletin Board System) client that connects to legacy telnet-based Korean BBS servers. The application consists of a React frontend and a Node.js backend that proxies telnet connections via WebSocket.

## Architecture

### Frontend (`frontend/`)
- **Technology**: React 18, Bootstrap 4, Socket.IO client, Canvas API
- **Main Component**: `frontend/src/App.js` - Single-file component (~1200 lines) containing all terminal emulation logic
- **Key Features**:
  - Canvas-based terminal emulator (640x528 pixels, 8x16 character cells, 33 lines)
  - ANSI/VT100 escape sequence parsing (colors, cursor movement, screen clearing)
  - Korean retro fonts: neodgm, neoiyg, neopil, neoancient, neowater, win31
  - Display themes: VGA, ACI, HERCULES (defined in `themes.js`)
  - Smart mouse: Pattern-based clickable link detection
  - ZMODEM file transfer UI

### Backend (`server/app.js`)
- **Technology**: Express.js, Socket.IO, telnet-stream
- **Connection Flow**:
  1. Client connects via Socket.IO
  2. Server creates TCP connection to BBS (bbs.olddos.kr:9000)
  3. TCP wrapped with TelnetSocket for protocol handling
  4. Bidirectional data: BBS ↔ EUC-KR encode/decode ↔ Socket.IO ↔ Browser

### Socket.IO Events
| Event | Direction | Purpose |
|-------|-----------|---------|
| `data` | Both | Terminal data (text/commands) |
| `rz-begin` | Server→Client | Download started |
| `rz-progress` | Server→Client | Download progress |
| `rz-end` | Server→Client | Download complete (includes URL) |
| `sz-ready` | Client→Server | Upload file prepared |
| `sz-begin` | Server→Client | Upload started |
| `sz-progress` | Server→Client | Upload progress |
| `sz-end` | Server→Client | Upload complete |

## Development Commands

```bash
# Full build and run (cleans, installs deps, builds frontend, starts server)
npm run serve

# Clean rebuild (removes node_modules)
npm run rebuild

# Frontend only (in frontend/ directory)
cd frontend
npm start            # Dev server on port 3000
npm run build        # Production build
npm test             # Jest tests

# Server only (requires frontend build first)
node server/app.js   # Runs on port 8199
```

Access at: http://localhost:8199

## Key Implementation Details

### Character Encoding
All BBS communication uses EUC-KR encoding:
- Incoming: `iconv.decode(buffer, 'euc-kr')`
- Outgoing: `iconv.encode(buffer, 'euc-kr')`

### ZMODEM Detection (server/app.js)
- Download trigger: Pattern `B00000000000000` spawns `rz` process
- Upload trigger: Pattern `B0100` spawns `sz` process
- Files cached in `frontend/build/file-cache/<uuid>/`

### Terminal Constants (frontend/src/App.js)
```javascript
const CANVAS_WIDTH = 640
const CANVAS_HEIGHT = 528
const FONT_WIDTH = 8
const FONT_HEIGHT = 16
const SCREEN_HEIGHT = 33
```

### System Requirements
- **rz/sz**: ZMODEM utilities for file transfers
- **convmv**: Filename encoding converter (UTF-8 ↔ EUC-KR)

## Important Notes

- Frontend must be built before running server (serves from `frontend/build/`)
- Uses npm, not yarn
- All Korean text must go through EUC-KR encoding pipeline
- BBS server configured at `bbs.olddos.kr:9000` in server/app.js
