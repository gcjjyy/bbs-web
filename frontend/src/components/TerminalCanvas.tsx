import { forwardRef, RefObject } from 'react'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants/terminalConfig'

interface TerminalCanvasProps {
  commandRef: RefObject<HTMLInputElement | null>
  smartMouseBoxRef: RefObject<HTMLDivElement | null>
  command: string
  commandType: string
  onTerminalClick: () => void
  onMouseMove: (clientX: number, clientY: number) => void
  onSmartMouseClick: () => void
  onCommandChange: (value: string) => void
  onKeyUp: (key: string) => void
}

const TerminalCanvas = forwardRef<HTMLCanvasElement, TerminalCanvasProps>(
  function TerminalCanvas(
    {
      commandRef,
      smartMouseBoxRef,
      command,
      commandType,
      onTerminalClick,
      onMouseMove,
      onSmartMouseClick,
      onCommandChange,
      onKeyUp
    },
    ref
  ) {
    return (
      <div className="text-center mt-3">
        <canvas
          ref={ref}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-100"
          style={{ maxWidth: '700px' }}
          onClick={onTerminalClick}
          onMouseMove={(event) => onMouseMove(event.clientX, event.clientY)}
        />
        <div
          ref={smartMouseBoxRef}
          className="smart-mouse-box"
          onClick={onSmartMouseClick}
        />
        <input
          ref={commandRef}
          type="text"
          className={
            commandType === 'password' ? 'command command-password' : 'command'
          }
          value={command}
          onChange={(event) => onCommandChange(event.target.value)}
          onKeyUp={(event) => onKeyUp(event.key)}
          autoComplete="off"
        />
      </div>
    )
  }
)

export default TerminalCanvas
