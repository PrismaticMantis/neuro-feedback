import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { EegDeviceProvider } from './lib/eeg/EegDeviceContext'
import { BRAINBIT_IPAD_MVP } from './lib/feature-flags'
import { installMuseBleConsoleCapture } from './lib/muse-ble-debug-capture'
import { installMuseWebBluetoothConnectInstrumentation } from './lib/muse-wb-connect-instrumentation'
import './lib/muse-fe8d-enumeration-debug'
import './lib/athena-ble-probe-debug'
import './lib/athena-write-tester-debug'
import App from './App.tsx'
import AppBrainBitMvp from './AppBrainBitMvp.tsx'
import './index.css'

installMuseBleConsoleCapture()
installMuseWebBluetoothConnectInstrumentation()

const RootApp = BRAINBIT_IPAD_MVP ? AppBrainBitMvp : App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EegDeviceProvider>
      <BrowserRouter>
        <RootApp />
      </BrowserRouter>
    </EegDeviceProvider>
  </StrictMode>,
)
