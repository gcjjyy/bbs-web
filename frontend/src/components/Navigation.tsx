import {
  Button,
  Nav,
  Navbar,
  NavDropdown,
  OverlayTrigger,
  Tooltip
} from 'react-bootstrap'
import { DISPLAYS } from '../constants/terminalConfig'

interface NavigationProps {
  onDisplaySelect: (selectedKey: string | null) => void
  onCopyToClipboard: () => void
  onHostChange: () => void
}

function Navigation({
  onDisplaySelect,
  onCopyToClipboard,
  onHostChange
}: NavigationProps) {
  return (
    <Navbar>
      <Navbar.Brand>
        <span style={{ color: 'yellow' }}>도</span>
        <span style={{ color: 'white' }}>/</span>
        <span style={{ color: 'red' }}>스</span>
        <span style={{ color: 'white' }}>/</span>
        <span style={{ color: 'cyan' }}>박</span>
        <span style={{ color: 'white' }}>/</span>
        <span style={{ color: 'lightgreen' }}>물</span>
        <span style={{ color: 'white' }}>/</span>
        <span style={{ color: 'yellow' }}>관</span>
      </Navbar.Brand>
      <Nav
        className="mr-auto"
        onSelect={(selectedKey) => onDisplaySelect(selectedKey)}
      >
        <NavDropdown title="테마" id="theme-dropdown">
          {DISPLAYS.map((display) => (
            <NavDropdown.Item key={display} eventKey={display}>
              {display}
            </NavDropdown.Item>
          ))}
        </NavDropdown>
      </Nav>
      <div className="nav-buttons">
        <OverlayTrigger
          placement="bottom"
          overlay={<Tooltip id="copy-tooltip">화면 갈무리</Tooltip>}
        >
          <Button
            variant="secondary"
            onClick={onCopyToClipboard}
            aria-label="화면 갈무리"
          >
            <i className="bi bi-camera" />
          </Button>
        </OverlayTrigger>
        <OverlayTrigger
          placement="bottom"
          overlay={<Tooltip id="host-tooltip">호스트 변경</Tooltip>}
        >
          <Button
            variant="secondary"
            onClick={onHostChange}
            aria-label="호스트 변경"
          >
            <i className="bi bi-hdd-network" />
          </Button>
        </OverlayTrigger>
      </div>
    </Navbar>
  )
}

export default Navigation
