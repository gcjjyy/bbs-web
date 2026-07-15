# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

bbs-web is a web-based BBS (Bulletin Board System) client for legacy telnet-based Korean BBS servers. A React frontend renders a canvas terminal emulator; a Bun/Express backend proxies the telnet connection over Socket.IO.

## Development Commands

The frontend uses npm with Vite; the server runs directly on **Bun** (no build step — `bun run src/app.ts`).

```bash
npm run install:all    # frontend npm deps + server bun deps
npm run serve          # install, build frontend, start server at http://localhost:8199
npm run dev:frontend   # Vite dev server (proxies /socket.io and /api to :8199)
npm run dev:server     # bun --watch server on port 8199
npm run build          # frontend production build (to frontend/build/)
npm run verify         # full check: frontend tests + build + server tests + typecheck
npm run rebuild        # clean node_modules and reinstall/rebuild everything
```

Individual checks:

```bash
cd frontend && npm run test:ci                    # all Vitest tests, no watch
cd frontend && npm run test:ci -- smartMouse      # single test file by name pattern
cd server && bun run test                         # server tests (bun test)
cd server && bun run typecheck                    # tsc --noEmit
```

The server serves the built frontend from `frontend/build/`, so the frontend must be built before running the server standalone.

Server configuration can be overridden with env vars: `BBS_ADDR`, `BBS_PORT`, `SERVER_PORT`, `SERVER_HOST` (defaults in `server/src/constants.ts`).

## Architecture

### Connection Flow

Browser ↔ Socket.IO ↔ server (`server/src/`) ↔ TCP/telnet ↔ BBS at `bbsweb.oscc.kr:9000` (call out compatibility implications when changing it).

1. `app.ts` — Express + Socket.IO setup; wires each client socket to a telnet connection; also exposes `POST /api/encode-filename` (UTF-8 → CP949, NFC-normalized for macOS filenames) used by ZMODEM uploads.
2. `telnet.ts` — TCP + TelnetSocket wrapper, EUC-KR decode stream, telnet option negotiation, and preprocessing that rewrites non-standard EUC-KR block characters (e.g. `0xADFC`) into private escape sequences (`ESC[=901B`) that survive iconv and are handled by the client renderer.
3. `zmodem.ts` — detects ZMODEM start patterns in the BBS stream and switches the socket into binary pass-through mode, chunking data at 8KB for smooth progress. Trigger detection keeps the previous packet's tail so patterns split across TCP packets are still caught.

### Socket.IO Events

| Event | Direction | Purpose |
|-------|-----------|---------|
| `data` | Both | Terminal data (EUC-KR-decoded text server→client, commands client→server) or raw ZMODEM binary during transfers |
| `zmodem-end` | Client→Server | ZMODEM session finished; resume normal decoding |
| `zmodem-cancel` | Client→Server | Abort ZMODEM transfer |
| `bbs-error` | Server→Client | BBS connection failure/close notification |

### Frontend (`frontend/src/`)

React 19 + TypeScript + Bootstrap 4, built with Vite; tests run on Vitest (jsdom). `App.tsx` is a thin shell; the logic lives in:

- `terminal/state.ts` — **module-level mutable singleton** `terminalState` (not React state) holding cursor, attributes, colors, socket, canvas ctx. Files under `terminal/` are plain modules operating on this singleton, not React hooks.
- `terminal/emulation.ts` — ANSI/VT100 CSI parser and canvas rendering (640×528 canvas, 8×16 cells, 33 lines — constants in `constants/terminalConfig.ts`). Scrolling uses `drawImage` self-copy; keep pixel readbacks (`getImageData`) out of the hot path.
- `terminal/network.ts` — socket setup, reconnect handling (a reconnect resets terminal state — the server opens a fresh BBS session per connection), data interceptor hook point used by ZMODEM.
- `terminal/smartMouse.ts` — pattern-based clickable link detection over rendered text; rebuilds are debounced behind `scheduleSmartMouseRebuild`.
- `hooks/useZmodem.ts` — the one genuine React hook: ZMODEM session state and dialogs. Download data is kept as chunk arrays and turned directly into a `Blob` (no full-file concatenation).
- `zmodem/` — pure TypeScript browser ZMODEM implementation (encode/decode/CRC/send/receive). Download triggers on stream pattern `B00000000000000`, upload on `B0100`. CRC comparisons must stay unsigned (`>>> 0`) — signed assembly regressed to false mismatches before.
- `components/` — `TerminalCanvas`, `Navigation`, and modals (download/upload/notification/file select).
- `themes.ts` — VGA / ACI / HERCULES display palettes; Korean retro fonts (NeoDunggeunmo default).

### Character Encoding

All BBS traffic is EUC-KR/CP949. Incoming data is decoded server-side (`iconv-lite` decode stream); outgoing input is encoded before hitting the telnet socket. Preserve this pipeline — Korean text must never bypass it.

## Conventions

- TypeScript throughout; 2-space indent, single quotes, no semicolons, no trailing commas, ~80-char lines.
- React function components, PascalCase component files, camelCase helpers, `use...` names only for real hooks under `hooks/`.
- Keep protocol logic in its module: terminal rendering in `terminal/`, ZMODEM in `frontend/src/zmodem/`, telnet/proxy in `server/src/`.
- Tests live next to the code as `*.test.ts(x)` (Vitest + React Testing Library on the frontend, `bun test` on the server).
- Commit messages: concise, imperative, sentence-case (e.g. `Improve terminal font fallback rendering`).
- Call out changes to encoding, Socket.IO events, BBS host constants, or file-transfer behavior — they affect compatibility with legacy servers.
