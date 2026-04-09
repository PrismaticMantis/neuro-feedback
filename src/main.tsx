import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { EegDeviceProvider } from './lib/eeg/EegDeviceContext'
import { installMuseBleConsoleCapture } from './lib/muse-ble-debug-capture'
import App from './App.tsx'
import './index.css'

installMuseBleConsoleCapture()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EegDeviceProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </EegDeviceProvider>
  </StrictMode>,
)
