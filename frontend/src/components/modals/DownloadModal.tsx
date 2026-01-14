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
  onDownload?: () => void
  useBrowserZmodem?: boolean
}

function DownloadModal({
  show,
  diagText,
  progress,
  progressNow,
  progressLabel,
  finished,
  url,
  onClose,
  onDownload,
  useBrowserZmodem = false
}: DownloadModalProps) {
  const handleDownloadClick = () => {
    if (useBrowserZmodem && onDownload) {
      onDownload()
    }
  }

  return (
    <Modal show={show} backdrop="static" centered>
      <Modal.Header>{diagText}</Modal.Header>
      <Modal.Body className="text-center m-4">
        {progress}
        <ProgressBar animated now={progressNow} label={progressLabel} />
      </Modal.Body>
      {finished && (
        <div className="text-center m-3">
          {useBrowserZmodem ? (
            <Button className="w-50 mr-3" onClick={handleDownloadClick}>다운로드</Button>
          ) : (
            <a href={url || undefined} download>
              <Button className="w-50 mr-3">다운로드</Button>
            </a>
          )}
          <Button onClick={onClose}>닫기</Button>
        </div>
      )}
    </Modal>
  )
}

export default DownloadModal
