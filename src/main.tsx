import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { EegDeviceProvider } from './lib/eeg/EegDeviceContext'
import { installMuseBleConsoleCapture } from './lib/muse-ble-debug-capture'
import { installMuseWebBluetoothConnectInstrumentation } from './lib/muse-wb-connect-instrumentation'
import './lib/muse-fe8d-enumeration-debug'
import './lib/athena-ble-probe-debug'
import './lib/athena-write-tester-debug'
import App from './App.tsx'
import './index.css'

installMuseBleConsoleCapture()
installMuseWebBluetoothConnectInstrumentation()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EegDeviceProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </EegDeviceProvider>
  </StrictMode>,
)
