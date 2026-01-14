import { Modal, Button } from 'react-bootstrap'

interface NotificationModalProps {
  show: boolean
  title: string
  text: string
  onClose: () => void
}

function NotificationModal({ show, title, text, onClose }: NotificationModalProps) {
  return (
    <Modal show={show} size="sm" backdrop="static" centered>
      <Modal.Header>{title}</Modal.Header>
      <Modal.Body className="text-center m-4" style={{ whiteSpace: 'pre-line' }}>
        {text}
      </Modal.Body>
      <div className="text-center m-3">
        <Button onClick={onClose}>확인</Button>
      </div>
    </Modal>
  )
}

export default NotificationModal
