# Repository Guidelines

## Project Structure & Module Organization

This repository contains a React frontend and a Bun/Express Socket.IO server for a
web-based Korean BBS telnet client.

- `frontend/src/`: React 19 + TypeScript application code.
- `frontend/src/components/`: UI components such as terminal and navigation.
- `frontend/src/hooks/`: terminal, Socket.IO, mouse, and ZMODEM hooks.
- `frontend/src/zmodem/`: browser-side ZMODEM implementation.
- `frontend/public/`: static CRA assets.
- `server/src/`: Express server, telnet bridge, ZMODEM handling, shared types, and
  BBS constants.

## Build, Test, and Development Commands

- `npm run install:all`: install frontend npm dependencies and server Bun
  dependencies.
- `npm run dev:frontend`: run the React development server from `frontend/`.
- `npm run dev:server`: run the Bun server in watch mode from `server/`.
- `npm run build`: build the frontend production bundle.
- `npm run serve`: install dependencies, build the frontend, then start the server.
- `cd frontend && npm test`: run Jest/React Testing Library tests.

The server serves the built frontend and listens at `http://localhost:8199`.

## Coding Style & Naming Conventions

Use TypeScript throughout. Follow the existing Prettier settings: 2-space
indentation, single quotes, no semicolons, no trailing commas, and 80-character
line width. Prefer React function components, PascalCase component files
(`TerminalCanvas.tsx`), camelCase helpers, and `use...` names for hooks.

Keep protocol logic in focused modules: terminal rendering belongs in frontend
components/hooks, ZMODEM code in `frontend/src/zmodem/`, and telnet/proxy logic in
`server/src/`.

## Testing Guidelines

Frontend tests use Jest with React Testing Library via `react-scripts test`.
Place tests near the code under `frontend/src/` and use the `*.test.tsx` naming
pattern, as in `App.test.tsx`. Add tests for user-visible behavior, hook logic,
and regressions in terminal or transfer flows. There is no dedicated server test
script yet, so validate server changes with focused manual Socket.IO/telnet checks.

## Commit & Pull Request Guidelines

Recent commits use concise, imperative, sentence-case messages such as
`Improve ZMODEM transfer performance with WebSocket and chunking`. Keep commits
scoped to one change.

Pull requests should include a short summary, test results, linked issues when
applicable, and screenshots or recordings for UI changes. Call out any changes to
encoding, Socket.IO events, BBS host constants, or file-transfer behavior because
those affect compatibility with legacy servers.

## Security & Configuration Tips

Do not commit secrets or local host overrides. The target BBS host and port are
configured in `server/src/constants.ts`; document compatibility implications when
changing them. Preserve the EUC-KR encoding pipeline for all BBS traffic.
