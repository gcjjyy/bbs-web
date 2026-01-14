import { Modal, Spinner } from 'react-bootstrap'

interface LoadingModalProps {
  show: boolean
  message: string
}

function LoadingModal({ show, message }: LoadingModalProps) {
  return (
    <Modal show={show} size='sm' backdrop='static' centered>
      <Modal.Header>
        {message}
      </Modal.Header>
      <Modal.Body className='text-center m-4'>
        <Spinner animation='border' />
      </Modal.Body>
    </Modal>
  )
}

export default LoadingModal
