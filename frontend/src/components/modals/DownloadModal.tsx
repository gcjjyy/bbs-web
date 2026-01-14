import { Modal, ProgressBar, Button } from 'react-bootstrap'

interface DownloadModalProps {
  show: boolean
  diagText: string
  progress: string
  progressNow: number
  progressLabel: string
  finished: boolean
  url: string | null
  onClose: () => void
}

function DownloadModal({
  show,
  diagText,
  progress,
  progressNow,
  progressLabel,
  finished,
  url,
  onClose
}: DownloadModalProps) {
  return (
    <Modal show={show} size="sm" backdrop="static" centered>
      <Modal.Header>{diagText}</Modal.Header>
      <Modal.Body className="text-center m-4">
        {progress}
        <ProgressBar animated now={progressNow} label={progressLabel} />
      </Modal.Body>
      {finished && (
        <div className="text-center m-3">
          <a href={url || undefined} download>
            <Button className="w-50 mr-3">다운로드</Button>
          </a>
          <Button onClick={onClose}>닫기</Button>
        </div>
      )}
    </Modal>
  )
}

export default DownloadModal
