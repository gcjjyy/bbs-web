// Download (rz) begin event data
export interface RzBeginData {
  filename: string
}

// Download (rz) progress event data
export interface RzProgressData {
  received: number
  total: number
  bps: number
}

// Download (rz) end event data
export interface RzEndData {
  code: number
  url: string
}

// Upload (sz) begin event data
export interface SzBeginData {
  filename: string
}

// Upload (sz) progress event data
export interface SzProgressData {
  sent: number
  total: number
  bps: number
}

// Upload (sz) end event data
export interface SzEndData {
  code: number
}

// HTTP upload progress event data
export interface UploadProgressData {
  loaded: number
  total: number
}

// Upload response from server
export interface UploadResponse {
  result: boolean
  szTargetDir?: string
  szFilename?: string
  error?: string
}

// File transfer hook return type
export interface UseFileTransferReturn {
  // Download state
  rzDiag: boolean
  rzDiagText: string
  rzProgress: string
  rzProgressNow: number
  rzProgressLabel: string
  rzFinished: boolean
  rzUrl: string | null
  rzClose: () => void
  // Upload state
  szDiag: boolean
  szDiagText: string
  uploadProgress: string
  uploadProgressNow: number
  uploadProgressLabel: string
  szProgress: string
  szProgressNow: number
  szProgressLabel: string
  szFinished: boolean
  szClose: () => void
  uploadFile: (file: File, overrideName?: string | null) => void
  // File select dialog
  fileSelectDiag: boolean
  setFileSelectDiag: React.Dispatch<React.SetStateAction<boolean>>
  // Rename dialog
  renameDiag: boolean
  renameExt: string
  renameInput: string
  setRenameInput: React.Dispatch<React.SetStateAction<string>>
  handleRenameUpload: () => void
  handleRenameCancel: () => void
  // Event setup
  setupFileTransferEvents: (io: import('socket.io-client').Socket) => void
}
