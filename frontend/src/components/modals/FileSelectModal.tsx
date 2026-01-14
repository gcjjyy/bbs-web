import { Modal, Button } from 'react-bootstrap'

interface FileSelectModalProps {
  show: boolean
  onSelect: () => void
  onCancel: () => void
}

function FileSelectModal({ show, onSelect, onCancel }: FileSelectModalProps) {
  return (
    <Modal show={show} backdrop="static" centered>
      <Modal.Header>파일 업로드</Modal.Header>
      <Modal.Body className="text-center m-4">
        업로드할 파일을 선택해주세요.
      </Modal.Body>
      <div className="text-center m-3">
        <Button className="mr-2" onClick={onSelect}>
          파일 선택
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          취소
        </Button>
      </div>
    </Modal>
  )
}

export default FileSelectModal
