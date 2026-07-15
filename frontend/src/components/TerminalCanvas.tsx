import {
  forwardRef,
  RefObject,
  type CompositionEvent,
  type FormEvent,
  type KeyboardEvent
} from 'react'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants/terminalConfig'

interface TerminalCanvasProps {
  commandRef: RefObject<HTMLInputElement | null>
  smartMouseBoxRef: RefObject<HTMLDivElement | null>
  command: string
  commandType: string
  onTerminalClick: () => void
  onMouseMove: (clientX: number, clientY: number) => void
  onSmartMouseClick: () => void
  onCommandInput: (value: string, isComposing: boolean) => void
  onCompositionStart: () => void
  onCompositionEnd: (value: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  onPaste: (text: string) => void
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
      onCommandInput,
      onCompositionStart,
      onCompositionEnd,
      onKeyDown,
      onPaste
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
          aria-label="터미널 입력"
          onInput={(event: FormEvent<HTMLInputElement>) => {
            const nativeEvent = event.nativeEvent as InputEvent
            onCommandInput(event.currentTarget.value, nativeEvent.isComposing)
          }}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={(event: CompositionEvent<HTMLInputElement>) =>
            onCompositionEnd(event.currentTarget.value)
          }
          onKeyDown={onKeyDown}
          onPaste={(event) => {
            const text = event.clipboardData.getData('text')
            if (text) {
              event.preventDefault()
              onPaste(text)
            }
          }}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>
    )
  }
)

export default TerminalCanvas
