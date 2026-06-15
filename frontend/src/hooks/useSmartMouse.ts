import {
  FONT_WIDTH,
  FONT_HEIGHT,
  SMART_MOUSE_BORDER
} from '../constants/terminalConfig'
import { terminalState } from './useTerminalState'
import type { SmartMousePattern, SmartMouseLink } from '../types/terminal'
import type { RefObject } from 'react'

// Smart mouse patterns for detecting clickable links
const SMART_MOUSE_PATTERNS: SmartMousePattern[] = [
  { pattern: /([0-9]+)\.\s[ㄱ-힣a-z/\s]+/gi, captureOnly: false }, // 99. xx
  { pattern: /\[([0-9]+)\]\s[ㄱ-힣a-z/\s]+/gi, captureOnly: false }, // [99].xx
  { pattern: /\(([a-z]+),/gi, captureOnly: true }, // (x,
  { pattern: /,([a-z]+),/gi, captureOnly: true }, // ,x,
  { pattern: /,([a-z]+)\)/gi, captureOnly: true }, // ,x)
  { pattern: /\(([a-z]+)\)/gi, captureOnly: true }, // (x)
  { pattern: /\[([a-z0-9]+)\]/gi, captureOnly: true }, // [x]
  { pattern: /(https?:\/\/[a-z0-9./?&_=#-]+)/gi, captureOnly: false }, // URL
  { pattern: /([0-9]+) +.+ +[0-9-]+ +[0-9]+ + [0-9]+ +.*/gi, captureOnly: false }, // Article
  { pattern: /([0-9]+) +[0-9.]+ .*/gi, captureOnly: false }, // News (JTBC)
  { pattern: /([0-9]+) +.+ +[0-9-]+ .*/gi, captureOnly: false }, // News (Oh my news, IT news)
  { pattern: /([0-9]+) +(JTBC|오마이뉴스|전자신문|속보|정치|연예|전체기사|주요기사|사회|오늘의 뉴스|게임)/gi, captureOnly: false } // News Titles
]

export const stripAnsiColorCodes = (text: string): string =>
  text.replace(new RegExp(String.raw`\x1b\[=.{1,3}[FG]`, 'gi'), '').trim()

export const rebuildSmartMouse = (smartMouseBoxRef: RefObject<HTMLDivElement | null>): void => {
  terminalState.smartMouse = []
  if (smartMouseBoxRef.current) {
    smartMouseBoxRef.current.style.visibility = 'hidden'
  }

  for (const { pattern, captureOnly } of SMART_MOUSE_PATTERNS) {
    let result: RegExpExecArray | null = null
    while ((result = pattern.exec(terminalState.lastPageText))) {
      // Remove ANSI escape code
      const fullMatch = stripAnsiColorCodes(result[0])
      const command = stripAnsiColorCodes(result[1])

      let linkX: number
      let linkWidth: number
      if (captureOnly) {
        // Highlight only the captured group
        const captureOffset = result[0].indexOf(result[1])
        const captureIndex = result.index + captureOffset
        linkX = terminalState.lastPageTextPos[captureIndex].x * FONT_WIDTH * terminalState.rate
        linkWidth = (terminalState.ctx2d?.measureText(command).width ?? 0) * terminalState.rate
      } else {
        // Highlight full match
        linkX = terminalState.lastPageTextPos[result.index].x * FONT_WIDTH * terminalState.rate
        linkWidth = (terminalState.ctx2d?.measureText(fullMatch).width ?? 0) * terminalState.rate
      }

      const link: SmartMouseLink = {
        command: command,
        px: {
          x: linkX,
          y: terminalState.lastPageTextPos[result.index].y * FONT_HEIGHT * terminalState.rate,
          width: linkWidth,
          height: FONT_HEIGHT * terminalState.rate
        }
      }
      terminalState.smartMouse.push(link)
    }
  }

  // Remove overlapping smart mouse areas on the same line, keep the leftmost one
  const filtered: SmartMouseLink[] = []
  for (const sm of terminalState.smartMouse) {
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
  terminalState.smartMouse = filtered
}

export const handleMouseMove = (
  clientX: number,
  clientY: number,
  terminalRef: RefObject<HTMLCanvasElement | null>,
  smartMouseBoxRef: RefObject<HTMLDivElement | null>
): void => {
  if (!terminalRef.current || !smartMouseBoxRef.current) return

  const mouseX = clientX - terminalRef.current.getBoundingClientRect().left
  const mouseY = clientY - terminalRef.current.getBoundingClientRect().top

  for (const sm of terminalState.smartMouse) {
    if (
      mouseX >= sm.px.x &&
      mouseY >= sm.px.y &&
      mouseX < sm.px.x + sm.px.width &&
      mouseY < sm.px.y + sm.px.height
    ) {
      // Internally set the smart mouse command
      terminalState.smartMouseCmd = sm.command

      // Move smart mouse box to the position
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

export const handleSmartMouseClick = (
  smartMouseBoxRef: RefObject<HTMLDivElement | null>,
  enterCommand: (command: string) => void
): void => {
  if (terminalState.smartMouseCmd && /https?:\/\//.exec(terminalState.smartMouseCmd)) {
    window.open(terminalState.smartMouseCmd, '_blank')
  } else if (terminalState.smartMouseCmd) {
    enterCommand(terminalState.smartMouseCmd)
  }

  if (smartMouseBoxRef.current) {
    smartMouseBoxRef.current.style.visibility = 'hidden'
  }
  terminalState.smartMouseCmd = ''
}
