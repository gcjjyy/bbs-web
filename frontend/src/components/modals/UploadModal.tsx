import { Modal, ProgressBar, Button } from 'react-bootstrap'

interface UploadModalProps {
  show: boolean
  diagText: string
  uploadProgress: string
  uploadProgressNow: number
  uploadProgressLabel: string
  szProgress: string
  szProgressNow: number
  szProgressLabel: string
  finished: boolean
  onClose: () => void
}

function UploadModal({
  show,
  diagText,
  uploadProgress,
  uploadProgressNow,
  uploadProgressLabel,
  szProgress,
  szProgressNow,
  szProgressLabel,
  finished,
  onClose
}: UploadModalProps) {
  return (
    <Modal show={show} size="sm" backdrop="static" centered>
      <Modal.Header>{diagText}</Modal.Header>
      <Modal.Body className="m-4">
        <div className="mb-3">
          <div className="d-flex justify-content-between mb-1">
            <small>웹 서버로 전송</small>
            <small>{uploadProgress}</small>
          </div>
          <ProgressBar
            striped
            animated
            now={uploadProgressNow}
            label={uploadProgressLabel}
            variant="info"
            className="progress-striped-bg"
          />
        </div>
        <div>
          <div className="d-flex justify-content-between mb-1">
            <small>BBS로 전송</small>
            <small>{szProgress}</small>
          </div>
          <ProgressBar
            striped
            animated
            now={szProgressNow}
            label={szProgressLabel}
            variant="success"
            className="progress-striped-bg"
          />
        </div>
      </Modal.Body>
      {finished && (
        <div className="text-center m-3">
          <Button onClick={onClose}>확인</Button>
        </div>
      )}
    </Modal>
  )
}

export default UploadModal
