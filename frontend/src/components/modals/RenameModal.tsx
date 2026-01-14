import { Modal, Button, Form } from 'react-bootstrap'
import type { KeyboardEvent, Dispatch, SetStateAction } from 'react'

interface RenameModalProps {
  show: boolean
  renameExt: string
  renameInput: string
  setRenameInput: Dispatch<SetStateAction<string>>
  onUpload: () => void
  onCancel: () => void
}

function RenameModal({
  show,
  renameExt,
  renameInput,
  setRenameInput,
  onUpload,
  onCancel
}: RenameModalProps) {
  const handleKeyPress = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onUpload()
    }
  }

  return (
    <Modal show={show} size="sm" backdrop="static" centered>
      <Modal.Header>파일명 변경</Modal.Header>
      <Modal.Body className="m-3">
        <p>
          파일명에 한글이 포함되어 있습니다.
          <br />
          영문 파일명을 입력해주세요.
        </p>
        <Form.Group>
          <Form.Label>
            새 파일명{' '}
            {renameExt && (
              <span className="text-muted">({renameExt} 자동 추가)</span>
            )}
          </Form.Label>
          <Form.Control
            type="text"
            placeholder="영문 파일명 입력"
            value={renameInput}
            onChange={(e) => setRenameInput(e.target.value)}
            onKeyPress={handleKeyPress}
          />
        </Form.Group>
      </Modal.Body>
      <div className="text-center m-3">
        <Button className="mr-2" onClick={onUpload}>
          업로드
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          취소
        </Button>
      </div>
    </Modal>
  )
}

export default RenameModal
