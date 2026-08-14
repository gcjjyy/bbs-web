import { useEffect, useState, type FormEvent } from 'react'
import { Modal, Button, Form } from 'react-bootstrap'

interface HostModalProps {
  show: boolean
  defaultHost: string
  defaultPort: number
  onConnect: (host: string, port: number) => void
  onCancel: () => void
}

function HostModal({
  show,
  defaultHost,
  defaultPort,
  onConnect,
  onCancel
}: HostModalProps) {
  const [host, setHost] = useState(defaultHost)
  const [port, setPort] = useState(String(defaultPort))
  const [error, setError] = useState('')

  useEffect(() => {
    if (show) {
      setHost(defaultHost)
      setPort(String(defaultPort))
      setError('')
    }
  }, [show, defaultHost, defaultPort])

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault()

    const trimmedHost = host.trim()
    const portNumber = Number(port)

    if (!trimmedHost) {
      setError('호스트를 입력해주세요.')
      return
    }

    if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
      setError('포트는 1~65535 사이의 숫자여야 합니다.')
      return
    }

    onConnect(trimmedHost, portNumber)
  }

  return (
    <Modal show={show} backdrop="static" centered onHide={onCancel}>
      <Modal.Header>호스트 변경</Modal.Header>
      <Form onSubmit={handleSubmit} noValidate>
        <Modal.Body>
          <Form.Group className="mb-3" controlId="hostModalHost">
            <Form.Label>호스트</Form.Label>
            <Form.Control
              value={host}
              onChange={(event) => setHost(event.target.value)}
              autoFocus
              autoComplete="off"
            />
          </Form.Group>
          <Form.Group controlId="hostModalPort">
            <Form.Label>포트</Form.Label>
            <Form.Control
              type="number"
              value={port}
              onChange={(event) => setPort(event.target.value)}
              autoComplete="off"
            />
          </Form.Group>
          {error && <div className="text-danger mt-2">{error}</div>}
        </Modal.Body>
        <div className="text-center m-3">
          <Button className="mr-2" type="submit">
            접속
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            취소
          </Button>
        </div>
      </Form>
    </Modal>
  )
}

export default HostModal
