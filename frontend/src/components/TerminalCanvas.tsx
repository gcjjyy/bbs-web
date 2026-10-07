import {
  forwardRef,
  RefObject,
  type CompositionEvent,
  type FormEvent,
  type KeyboardEvent
} from 'react'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants/terminalConfig'

interface TerminalCanvasProps {
  inputOverlayRef: RefObject<HTMLCanvasElement | null>
  commandRef: RefObject<HTMLTextAreaElement | null>
  smartMouseBoxRef: RefObject<HTMLDivElement | null>
  onTerminalClick: () => void
  onMouseMove: (clientX: number, clientY: number) => void
  onSmartMouseClick: () => void
  onCommandInput: (
    field: HTMLTextAreaElement,
    isComposing: boolean,
    inputType: string | undefined
  ) => void
  onCompositionStart: () => void
  onCompositionEnd: (
    field: HTMLTextAreaElement,
    data: string | undefined
  ) => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onPaste: (text: string) => void
}

const TerminalCanvas = forwardRef<HTMLCanvasElement, TerminalCanvasProps>(
  function TerminalCanvas(
    {
      inputOverlayRef,
      commandRef,
      smartMouseBoxRef,
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
        <div className="terminal-canvas-stack">
          <canvas
            ref={ref}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="terminal-canvas"
            onClick={onTerminalClick}
            onMouseMove={(event) => onMouseMove(event.clientX, event.clientY)}
          />
          <canvas
            ref={inputOverlayRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="terminal-input-overlay"
            aria-hidden="true"
          />
        </div>
        <div
          ref={smartMouseBoxRef}
          className="smart-mouse-box"
          onClick={onSmartMouseClick}
        />
        <textarea
          ref={commandRef}
          className="terminal-ime-input"
          aria-label="터미널 입력"
          rows={1}
          onInput={(event: FormEvent<HTMLTextAreaElement>) => {
            const nativeEvent = event.nativeEvent as InputEvent
            onCommandInput(
              event.currentTarget,
              nativeEvent.isComposing,
              nativeEvent.inputType
            )
          }}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={(event: CompositionEvent<HTMLTextAreaElement>) =>
            onCompositionEnd(event.currentTarget, event.data)
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
          data-form-type="other"
          data-lpignore="true"
          data-1p-ignore="true"
        />
      </div>
    )
  }
)

export default TerminalCanvas
