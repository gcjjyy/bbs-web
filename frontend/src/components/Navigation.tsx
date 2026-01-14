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
}

function Navigation({ onDisplaySelect, onCopyToClipboard }: NavigationProps) {
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
          <Button variant="secondary" onClick={onCopyToClipboard}>
            갈무리
          </Button>
        </OverlayTrigger>
      </div>
    </Navbar>
  )
}

export default Navigation
