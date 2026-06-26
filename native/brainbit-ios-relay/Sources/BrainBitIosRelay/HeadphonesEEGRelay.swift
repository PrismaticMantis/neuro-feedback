import Foundation
@preconcurrency import neurosdk2

/// neurosdk2 scan/connect/stream for BrainBit Headphones → WebSocket JSON fanout.
final class HeadphonesEEGRelay: @unchecked Sendable {
    private let fanout: EEGWebSocketFanout
    private let deviceQueue = DispatchQueue(label: "brainbit-ios-relay.device", qos: .userInitiated)
    /// All neurosdk2 connect/exec/amplifier calls run here (serial — avoids racey StartSignal).
    private let sensorCommandQueue = DispatchQueue(label: "brainbit-ios-relay.sensor-commands", qos: .userInitiated)

    private var scanner: NTScanner?
    private var sensor: NTHeadphones2?
    private var scanTimeoutWork: DispatchWorkItem?
    private var scanRetryWork: DispatchWorkItem?
    private var connectWatchdogWork: DispatchWorkItem?
    private var firstChunkWatchdogWork: DispatchWorkItem?
    private var stopped = false
    private var scanning = false
    private var scanAttempt = 0
    private var scanCallbackCount = 0
    private var connected = false
    private var signalStarted = false
    private var signalStartInFlight = false
    private var streamingRecoveryInProgress = false
    private var consecutiveSignalRecoveries = 0
    private var fullReconnectAttempts = 0
    private var validChunkStreakSinceRecovery: UInt64 = 0
    private var lastRecoveryStartedAt: DispatchTime?
    private var lastConnectedInfo: NTSensorInfo?
    private var lastBatteryPercent = -1
    private var chunkCount: UInt64 = 0
    private var lastValidChunkWallNs: UInt64 = 0
    private var sequence: UInt64 = 0
    private var connectionCallbackCount = 0
    private var identicalSentinelStreak = 0
    private var lastAmpMode: NTSensorAmpMode = .invalid
    private var resistSpikeCompleted = false
    private var resistSpikeInProgress = false
    private var resistSpikeSampleCount: UInt64 = 0
    private var resistSpikeEndWork: DispatchWorkItem?

    init(fanout: EEGWebSocketFanout) {
        self.fanout = fanout
    }

    func start() {
        deviceQueue.async { [self] in
            stopped = false
            #if os(iOS)
            BluetoothReadiness.shared.logSnapshot(label: "relay-start")
            print(
                "[HeadphonesEEG] idle — BLE scan deferred until WebSocket client connects " +
                    "(tap Connect BrainBit in app)"
            )
            #else
            beginScan(reason: "startup")
            #endif
        }
    }

    /// Restart or start BLE scan when the UI connects to the relay WebSocket.
    func resumeScanIfNeeded(reason: String) {
        deviceQueue.async { [self] in
            guard !stopped, !signalStarted, !signalStartInFlight else {
                print(
                    "[HeadphonesEEG] resumeScan skipped reason=\(reason) " +
                        "stopped=\(stopped) signalStarted=\(signalStarted) inFlight=\(signalStartInFlight)"
                )
                return
            }
            if sensor != nil {
                print("[HeadphonesEEG] resumeScan skipped reason=\(reason) — sensor already created")
                return
            }
            if scanning {
                print("[HeadphonesEEG] resumeScan skipped reason=\(reason) — scan already active")
                return
            }
            scanRetryWork?.cancel()
            scanRetryWork = nil
            beginScan(reason: reason)
        }
    }

    func stop() {
        deviceQueue.async { [self] in
            stopped = true
            scanTimeoutWork?.cancel()
            scanTimeoutWork = nil
            scanRetryWork?.cancel()
            scanRetryWork = nil
            connectWatchdogWork?.cancel()
            connectWatchdogWork = nil
            firstChunkWatchdogWork?.cancel()
            firstChunkWatchdogWork = nil
            resistSpikeEndWork?.cancel()
            resistSpikeEndWork = nil
            stopSignalLocked()
            sensorCommandQueue.async { [self] in
                self.sensor?.disconnect()
            }
            sensor = nil
            runOnScannerQueue { [self] in
                scanner?.stopScan()
                scanner = nil
                scanning = false
            }
            connected = false
            connectionCallbackCount = 0
            identicalSentinelStreak = 0
            consecutiveSignalRecoveries = 0
            fullReconnectAttempts = 0
            validChunkStreakSinceRecovery = 0
            lastRecoveryStartedAt = nil
            lastConnectedInfo = nil
            lastBatteryPercent = -1
            resistSpikeCompleted = false
            resistSpikeInProgress = false
            resistSpikeSampleCount = 0
            print("[HeadphonesEEG] stopped")
        }
    }

    private func beginScan(reason: String) {
        guard !stopped, sensor == nil, !signalStarted, !signalStartInFlight else { return }

        scanAttempt += 1
        print(
            "[HeadphonesEEG] scan requested attempt=\(scanAttempt) reason=\(reason) " +
                "family=NTSensorFamilyLEHeadPhones2 timeout=\(RelayConfiguration.deviceScanTimeoutSec)s"
        )

        #if os(iOS)
        BluetoothReadiness.shared.logSnapshot(label: "pre-scan-attempt-\(scanAttempt)")
        BluetoothReadiness.shared.whenReady { [weak self] ready in
            guard let self else { return }
            self.runOnScannerQueue {
                guard !self.stopped, self.sensor == nil, !self.signalStarted, !self.signalStartInFlight else { return }
                if ready {
                    self.beginScanOnScannerQueue(reason: reason)
                } else {
                    self.scanning = false
                    print(
                        "[HeadphonesEEG] scan deferred attempt=\(self.scanAttempt) — " +
                            "Bluetooth not ready (enable Bluetooth and allow permission)"
                    )
                    self.scheduleScanRetry(reason: "bluetooth-not-ready")
                }
            }
        }
        #else
        runOnScannerQueue { [self] in
            beginScanOnScannerQueue(reason: reason)
        }
        #endif
    }

    private func beginScanOnScannerQueue(reason: String) {
        guard !stopped, sensor == nil, !signalStarted, !signalStartInFlight else { return }

        scanning = true
        scanCallbackCount = 0
        print(
            "[HeadphonesEEG] scan started attempt=\(scanAttempt) reason=\(reason) " +
                "queue=\(Self.queueLabel) onMainThread=\(Thread.isMainThread)"
        )

        let filter = [NTSensorFamily.leHeadPhones2.rawValue]
        guard let scanner = NTScanner(sensorFamily: filter) else {
            scanning = false
            print("[HeadphonesEEG] scan failed attempt=\(scanAttempt) — could not create NTScanner")
            scheduleScanRetry(reason: "scanner-create-failed")
            return
        }

        print(
            "[HeadphonesEEG] scanner created attempt=\(scanAttempt) " +
                "retained=\(ObjectIdentifier(scanner)) filter=\(filter)"
        )

        self.scanner?.stopScan()
        self.scanner = scanner

        scanner.setSensorsCallback { [weak self] sensors in
            guard let self else { return }
            self.runOnScannerQueue {
                self.handleDiscoveredSensors(sensors)
            }
        }

        scanner.startScan()
        print("[HeadphonesEEG] scanner startScan() called attempt=\(scanAttempt)")
        scheduleScanTimeout()
    }

    private func scheduleScanTimeout() {
        scanTimeoutWork?.cancel()
        let attempt = scanAttempt
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.runOnScannerQueue {
                self.scanning = false
                self.scanner?.stopScan()
                guard self.sensor == nil, !self.stopped, !self.signalStarted else { return }
                print(
                    "[HeadphonesEEG] scan timeout attempt=\(attempt) callbacks=\(self.scanCallbackCount) — " +
                        "no Headphones found (power on, wear device, tap Connect BrainBit to retry)"
                )
                self.scheduleScanRetry(reason: "timeout-retry")
            }
        }
        scanTimeoutWork = work
        runOnScannerQueue {
            self.deviceQueue.asyncAfter(
                deadline: .now() + .seconds(RelayConfiguration.deviceScanTimeoutSec),
                execute: work
            )
        }
    }

    private func scheduleScanRetry(reason: String) {
        guard !stopped, sensor == nil, !signalStarted, !scanning else { return }

        scanRetryWork?.cancel()
        let delaySec = RelayConfiguration.deviceScanRetryDelaySec
        print("[HeadphonesEEG] scan retry scheduled reason=\(reason) delay=\(delaySec)s nextAttempt=\(scanAttempt + 1)")
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.deviceQueue.async {
                self.beginScan(reason: reason)
            }
        }
        scanRetryWork = work
        deviceQueue.asyncAfter(deadline: .now() + .seconds(delaySec), execute: work)
    }

    private func handleDiscoveredSensors(_ sensors: [NTSensorInfo]) {
        scanCallbackCount += 1
        print(
            "[HeadphonesEEG] scan callback #\(scanCallbackCount) attempt=\(scanAttempt) " +
                "count=\(sensors.count) onMainThread=\(Thread.isMainThread)"
        )

        for (index, info) in sensors.enumerated() {
            print(
                "[HeadphonesEEG] scan result[\(index)] name=\(info.name) address=\(info.address) " +
                    "family=\(info.sensFamily.rawValue) rssi=\(info.rssi) sn=\(info.serialNumber)"
            )
        }

        guard sensor == nil else {
            print("[HeadphonesEEG] scan callback ignored — sensor already exists")
            return
        }

        let headphonesMatches = sensors.filter { $0.sensFamily == .leHeadPhones2 }
        if !sensors.isEmpty, headphonesMatches.isEmpty {
            print(
                "[HeadphonesEEG] scan callback — \(sensors.count) device(s) seen but none match " +
                    "NTSensorFamilyLEHeadPhones2 (family filter=\(NTSensorFamily.leHeadPhones2.rawValue))"
            )
        }

        guard let info = headphonesMatches.first ?? sensors.first else {
            if sensors.isEmpty {
                print("[HeadphonesEEG] scan callback — empty device list")
            }
            return
        }

        scanTimeoutWork?.cancel()
        scanTimeoutWork = nil
        scanRetryWork?.cancel()
        scanRetryWork = nil
        scanning = false
        scanner?.stopScan()

        print(
            "[HeadphonesEEG] found device attempt=\(scanAttempt) name=\(info.name) address=\(info.address) " +
                "sn=\(info.serialNumber) family=\(info.sensFamily.rawValue) rssi=\(info.rssi)"
        )

        sensorCommandQueue.async { [weak self] in
            guard let self else { return }
            let created = self.scanner?.createSensor(info)
            self.deviceQueue.async {
                self.beginConnect(created: created, info: info)
            }
        }
    }

    private func beginConnect(created: NTSensor?, info: NTSensorInfo) {
        guard sensor == nil else { return }

        guard let headphones = created as? NTHeadphones2 else {
            print(
                "[HeadphonesEEG] connect failed — createSensor expected NTHeadphones2, got " +
                    "\(String(describing: type(of: created)))"
            )
            scheduleScanRetry(reason: "create-sensor-failed")
            return
        }

        sensor = headphones
        lastConnectedInfo = info
        print(
            "[HeadphonesEEG] connect started name=\(info.name) " +
                "initialState=\(Self.describeState(headphones.state)) " +
                "ampMode=\(Self.describeAmpMode(headphones.ampMode)) " +
                "startSignalSupported=\(headphones.isSupportedCommand(.startSignal))"
        )

        headphones.setConnectionStateCallback { [weak self] state in
            guard let self else { return }
            self.deviceQueue.async {
                self.handleConnectionState(state, origin: "callback")
            }
        }
        headphones.setBatteryCallback { [weak self] power in
            guard let self else { return }
            self.deviceQueue.async {
                self.handleBatteryUpdate(power.intValue, origin: "callback")
            }
        }
        headphones.setAmpModeCallback { [weak self] mode in
            guard let self else { return }
            self.deviceQueue.async {
                self.handleAmpMode(mode, origin: "callback")
            }
        }

        scheduleConnectWatchdog(for: headphones)
        scheduleConnectionPolls(for: headphones)

        sensorCommandQueue.async { [weak self] in
            guard let self else { return }
            headphones.connect()
            let postConnectState = headphones.state
            print(
                "[HeadphonesEEG] connect() returned state=\(Self.describeState(postConnectState)) " +
                    "ampMode=\(Self.describeAmpMode(headphones.ampMode))"
            )
            self.deviceQueue.async {
                self.evaluateReadyToStream(origin: "post-connect", sensor: headphones)
            }
        }
    }

    private func scheduleConnectWatchdog(for sensor: NTHeadphones2) {
        connectWatchdogWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self, !self.signalStarted, !self.signalStartInFlight else { return }
            print(
                "[HeadphonesEEG] connect watchdog (\(RelayConfiguration.deviceConnectTimeoutSec)s): " +
                    "signal not started; state=\(Self.describeState(sensor.state)) " +
                    "ampMode=\(Self.describeAmpMode(sensor.ampMode)) " +
                    "connectionCallbacks=\(self.connectionCallbackCount) chunks=\(self.chunkCount)"
            )
        }
        connectWatchdogWork = work
        deviceQueue.asyncAfter(deadline: .now() + .seconds(RelayConfiguration.deviceConnectTimeoutSec), execute: work)
    }

    private func scheduleFirstChunkWatchdog(for sensor: NTHeadphones2, origin: String) {
        firstChunkWatchdogWork?.cancel()
        let chunksBefore = chunkCount
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            guard self.chunkCount == chunksBefore else { return }
            print(
                "[HeadphonesEEG] first-chunk watchdog (\(RelayConfiguration.firstChunkTimeoutSec)s) " +
                    "origin=\(origin) — no EEG chunks after StartSignal; " +
                    "state=\(Self.describeState(sensor.state)) ampMode=\(Self.describeAmpMode(sensor.ampMode))"
            )
            self.recoverStreaming(sensor: sensor, reason: "first-chunk-timeout")
        }
        firstChunkWatchdogWork = work
        deviceQueue.asyncAfter(deadline: .now() + .seconds(RelayConfiguration.firstChunkTimeoutSec), execute: work)
    }

    private func scheduleConnectionPolls(for sensor: NTHeadphones2) {
        for delay in [0.5, 1.0, 2.0, 4.0, 8.0] {
            deviceQueue.asyncAfter(deadline: .now() + delay) { [weak self] in
                guard let self, self.sensor === sensor, !self.signalStarted, !self.signalStartInFlight else { return }
                self.evaluateReadyToStream(origin: "poll+\(delay)s", sensor: sensor)
            }
        }
    }

    private func handleConnectionState(_ state: NTSensorState, origin: String) {
        connectionCallbackCount += 1
        print(
            "[HeadphonesEEG] connection \(origin) #\(connectionCallbackCount): " +
                "state=\(Self.describeState(state)) signalStarted=\(signalStarted) chunks=\(chunkCount)"
        )

        if state == .inRange {
            connected = true
            evaluateReadyToStream(origin: origin, sensor: sensor)
            return
        }

        connected = false
        if signalStarted || chunkCount > 0 {
            print(
                "[HeadphonesEEG] connection lost during stream — escalating to full reconnect " +
                    "state=\(Self.describeState(state))"
            )
            performFullSensorReconnect(reason: "connection-\(Self.describeState(state))", force: true)
        }
    }

    private func handleAmpMode(_ mode: NTSensorAmpMode, origin: String) {
        let prev = lastAmpMode
        lastAmpMode = mode
        print(
            "[HeadphonesEEG] ampMode \(origin): \(Self.describeAmpMode(prev)) → \(Self.describeAmpMode(mode)) " +
                "chunks=\(chunkCount) sentinelStreak=\(identicalSentinelStreak)"
        )

        guard signalStarted || chunkCount > 0 else { return }
        let ok: Bool
        switch mode {
        case .signal, .signalResist:
            ok = true
        default:
            ok = false
        }
        if !ok, let sensor {
            print("[HeadphonesEEG] ampMode left signal during stream — scheduling recovery")
            recoverStreaming(sensor: sensor, reason: "ampMode-\(Self.describeAmpMode(mode))")
        }
    }

    private func evaluateReadyToStream(origin: String, sensor: NTHeadphones2?) {
        guard let sensor, self.sensor === sensor else { return }

        let state = sensor.state
        print(
            "[HeadphonesEEG] evaluate (\(origin)) state=\(Self.describeState(state)) " +
                "ampMode=\(Self.describeAmpMode(sensor.ampMode)) connected=\(connected) " +
                "signalStarted=\(signalStarted) inFlight=\(signalStartInFlight)"
        )

        if state == .inRange {
            connected = true
        }

        guard !signalStarted, !signalStartInFlight, !resistSpikeInProgress else { return }

        if state == .inRange {
            // Resist validation belongs in headphones2-truth-test only — session EEG is signal-only.
            startSignalLocked(on: sensor, origin: origin)
            return
        }

        if origin == "post-connect" || origin.hasPrefix("poll+") {
            print("[HeadphonesEEG] still outOfRange at \(origin) — waiting for inRange or next poll")
        }
    }

    private func beginResistValidationSpike(on sensor: NTHeadphones2, origin: String) {
        guard !resistSpikeInProgress, !resistSpikeCompleted else { return }
        resistSpikeInProgress = true
        signalStartInFlight = true
        resistSpikeSampleCount = 0

        let durationSec = RelayConfiguration.resistValidationSpikeDurationSec
        print(
            "[HeadphonesEEG] RESIST_SPIKE START origin=\(origin) duration=\(durationSec)s — " +
                "log A1/C3/C4/A2 while seated, lift one pad, remove headphones; " +
                "EEG signal starts automatically after spike"
        )

        sensorCommandQueue.async { [weak self] in
            guard let self else { return }
            sensor.setSignalDataCallback(nil)
            sensor.setResistCallback(nil)
            if sensor.isSupportedCommand(.stopSignal) {
                sensor.execCommand(.stopSignal)
            }
            if sensor.isSupportedCommand(.stopResist) {
                sensor.execCommand(.stopResist)
            }
            if sensor.isSupportedCommand(.idle) {
                sensor.execCommand(.idle)
            }

            self.configureHeadphonesResistProbe(sensor)
            sensor.setResistCallback { [weak self] data in
                self?.logResistSpikeSample(data, sensor: sensor)
            }

            guard sensor.isSupportedCommand(.startResist) else {
                print("[HeadphonesEEG] RESIST_SPIKE aborted — StartResist not supported")
                self.finishResistValidationSpike(on: sensor, reason: "startResist-unsupported")
                return
            }

            print(
                "[HeadphonesEEG] RESIST_SPIKE ExecCommand(startResist) " +
                    "ampMode=\(Self.describeAmpMode(sensor.ampMode)) state=\(Self.describeState(sensor.state))"
            )
            sensor.execCommand(.startResist)

            self.deviceQueue.async { [weak self] in
                guard let self else { return }
                self.resistSpikeEndWork?.cancel()
                let work = DispatchWorkItem { [weak self] in
                    guard let self else { return }
                    self.sensorCommandQueue.async {
                        self.finishResistValidationSpike(on: sensor, reason: "duration-elapsed")
                    }
                }
                self.resistSpikeEndWork = work
                self.deviceQueue.asyncAfter(deadline: .now() + .seconds(durationSec), execute: work)
            }
        }
    }

    private func configureHeadphonesResistProbe(_ sensor: NTHeadphones2) {
        let param = NTHeadphones2AmplifierParam(
            chSignalUse1: false,
            chSignalUse2: false,
            chSignalUse3: false,
            chSignalUse4: false,
            chResistUse1: true,
            chResistUse2: true,
            chResistUse3: true,
            chResistUse4: true,
            chGain1: .gain6,
            chGain2: .gain6,
            chGain3: .gain6,
            chGain4: .gain6,
            current: .genCurr6nA
        )
        sensor.amplifierParam = param
        let readback = sensor.amplifierParam
        print(
            "[HeadphonesEEG] RESIST_SPIKE amplifier configured " +
                "ChSignalUse=\(readback.chSignalUse1),\(readback.chSignalUse2),\(readback.chSignalUse3),\(readback.chSignalUse4) " +
                "ChResistUse=\(readback.chResistUse1),\(readback.chResistUse2),\(readback.chResistUse3),\(readback.chResistUse4) " +
                "ampMode=\(Self.describeAmpMode(sensor.ampMode))"
        )
    }

    private func logResistSpikeSample(_ data: [NTHeadphones2ResistData], sensor: NTHeadphones2) {
        guard !data.isEmpty else { return }
        resistSpikeSampleCount += 1
        let sample = data[0]
        let values = [
            sample.ch1.floatValue,
            sample.ch2.floatValue,
            sample.ch3.floatValue,
            sample.ch4.floatValue,
        ]
        let spread = (values.max() ?? 0) - (values.min() ?? 0)
        let verbose = resistSpikeSampleCount <= 5 || resistSpikeSampleCount % 20 == 0
        if verbose {
            print(
                "[HeadphonesEEG] RESIST_SPIKE sample #\(resistSpikeSampleCount) packNum=\(sample.packNum) " +
                    "A1=\(values[0]) C3=\(values[1]) C4=\(values[2]) A2=\(values[3]) spread=\(spread) " +
                    "ampMode=\(Self.describeAmpMode(sensor.ampMode)) batt=\(batteryLogLabel())"
            )
        }
    }

    private func finishResistValidationSpike(on sensor: NTHeadphones2, reason: String) {
        resistSpikeEndWork?.cancel()
        resistSpikeEndWork = nil

        if sensor.isSupportedCommand(.stopResist) {
            sensor.execCommand(.stopResist)
            print("[HeadphonesEEG] RESIST_SPIKE ExecCommand(stopResist) reason=\(reason)")
        }
        sensor.setResistCallback(nil)

        print(
            "[HeadphonesEEG] RESIST_SPIKE END reason=\(reason) samples=\(resistSpikeSampleCount) — " +
                "starting signal-only EEG"
        )

        deviceQueue.async { [weak self] in
            guard let self else { return }
            self.resistSpikeCompleted = true
            self.resistSpikeInProgress = false
            self.signalStartInFlight = false
            self.evaluateReadyToStream(origin: "post-resist-spike", sensor: sensor)
        }
    }

    private func startSignalLocked(on sensor: NTHeadphones2, origin: String) {
        guard !signalStarted, !signalStartInFlight else { return }
        guard sensor.isSupportedCommand(.startSignal) else {
            print("[HeadphonesEEG] signal start failed — StartSignal not supported")
            return
        }

        signalStartInFlight = true
        connectWatchdogWork?.cancel()
        connectWatchdogWork = nil
        print("[HeadphonesEEG] signal start requested via \(origin)")

        sensorCommandQueue.async { [weak self] in
            guard let self else { return }
            self.runStartSignalSequence(on: sensor, origin: origin, isRecovery: false)
        }
    }

    private func runStartSignalSequence(on sensor: NTHeadphones2, origin: String, isRecovery: Bool) {
        logSensorSnapshot(sensor, label: "pre-start-\(origin)")

        sensor.setSignalDataCallback(nil)
        sensor.setResistCallback(nil)

        if isRecovery || signalStarted {
            if sensor.isSupportedCommand(.stopSignal) {
                sensor.execCommand(.stopSignal)
                print("[HeadphonesEEG] ExecCommand(stopSignal) before signal-only configure")
            }
            signalStarted = false
        }

        if sensor.isSupportedCommand(.stopResist) {
            sensor.execCommand(.stopResist)
            print("[HeadphonesEEG] ExecCommand(stopResist) before signal-only configure")
        }

        if sensor.isSupportedCommand(.idle) {
            sensor.execCommand(.idle)
            print("[HeadphonesEEG] ExecCommand(idle) before signal-only amplifier configure")
        }

        let settleMs = RelayConfiguration.signalStartSettleMs
        if settleMs > 0 {
            usleep(useconds_t(settleMs * 1000))
            print("[HeadphonesEEG] post-idle settle \(settleMs)ms before signal-only amplifier configure")
        }

        logAmplifierReadback(sensor, label: "pre-signal-before-write")
        configureHeadphonesAmplifier(sensor)
        verifyAmplifierConfiguration(sensor)

        sensor.setSignalDataCallback { [weak self] data in
            guard let self else { return }
            self.broadcastSignal(data, sensor: sensor)
        }

        print(
            "[HeadphonesEEG] ExecCommand(startSignal) origin=\(origin) " +
                "ampMode=\(Self.describeAmpMode(sensor.ampMode)) state=\(Self.describeState(sensor.state))"
        )
        sensor.execCommand(.startSignal)
        print(
            "[HeadphonesEEG] StartSignal returned ampMode=\(Self.describeAmpMode(sensor.ampMode)) — awaiting chunks"
        )

        deviceQueue.async { [weak self] in
            guard let self else { return }
            self.signalStartInFlight = false
            self.signalStarted = true
            self.scheduleFirstChunkWatchdog(for: sensor, origin: origin)
        }
    }

    private func recoverStreaming(sensor: NTHeadphones2, reason: String) {
        deviceQueue.async { [weak self] in
            guard let self, !self.stopped else { return }
            guard !self.streamingRecoveryInProgress else {
                print(
                    "[HeadphonesEEG] streaming recovery skipped — already in progress " +
                        "reason=\(reason) sentinelStreak=\(self.identicalSentinelStreak)"
                )
                return
            }

            let cooldown = RelayConfiguration.streamingRecoveryCooldownSec
            if let lastRecoveryStartedAt = self.lastRecoveryStartedAt {
                let deltaNs = DispatchTime.now().uptimeNanoseconds - lastRecoveryStartedAt.uptimeNanoseconds
                if Double(deltaNs) / 1e9 < cooldown {
                    print(
                        "[HeadphonesEEG] streaming recovery skipped — cooldown \(String(format: "%.1f", cooldown))s " +
                            "reason=\(reason) sentinelStreak=\(self.identicalSentinelStreak)"
                    )
                    return
                }
            }

            if self.consecutiveSignalRecoveries >= RelayConfiguration.streamingRecoveryMaxSignalRestarts {
                if self.fullReconnectAttempts < RelayConfiguration.streamingRecoveryMaxFullReconnects {
                    self.performFullSensorReconnect(reason: reason)
                } else {
                    print(
                        "[HeadphonesEEG] streaming recovery exhausted " +
                            "signalRestarts=\(self.consecutiveSignalRecoveries) " +
                            "fullReconnects=\(self.fullReconnectAttempts) reason=\(reason)"
                    )
                }
                return
            }

            self.beginSignalRestartRecovery(sensor: sensor, reason: reason)
        }
    }

    private func beginSignalRestartRecovery(sensor: NTHeadphones2, reason: String) {
        streamingRecoveryInProgress = true
        consecutiveSignalRecoveries += 1
        signalStartInFlight = true
        firstChunkWatchdogWork?.cancel()
        firstChunkWatchdogWork = nil
        lastRecoveryStartedAt = .now()
        validChunkStreakSinceRecovery = 0
        identicalSentinelStreak = 0

        let attempt = consecutiveSignalRecoveries
        print(
            "[HeadphonesEEG] streaming recovery strategy=signalRestart #\(attempt) reason=\(reason) " +
                "chunks=\(chunkCount) batt=\(batteryLogLabel()) ampMode=\(Self.describeAmpMode(sensor.ampMode)) " +
                "state=\(Self.describeState(sensor.state))"
        )

        sensorCommandQueue.async { [weak self] in
            guard let self else { return }
            self.runStartSignalSequence(on: sensor, origin: "recovery-\(reason)", isRecovery: true)
            self.deviceQueue.async {
                self.streamingRecoveryInProgress = false
            }
        }
    }

    private func performFullSensorReconnect(reason: String, force: Bool = false) {
        if streamingRecoveryInProgress && !force {
            print(
                "[HeadphonesEEG] full reconnect skipped — recovery in progress reason=\(reason)"
            )
            return
        }
        guard let info = lastConnectedInfo else {
            print("[HeadphonesEEG] full reconnect skipped — no lastConnectedInfo; scheduling rescan")
            scheduleScanRetry(reason: "reconnect-no-device-info")
            return
        }
        guard fullReconnectAttempts < RelayConfiguration.streamingRecoveryMaxFullReconnects else {
            print(
                "[HeadphonesEEG] full reconnect exhausted attempts=\(fullReconnectAttempts) reason=\(reason)"
            )
            return
        }

        streamingRecoveryInProgress = true
        fullReconnectAttempts += 1
        consecutiveSignalRecoveries = 0
        signalStartInFlight = false
        signalStarted = false
        firstChunkWatchdogWork?.cancel()
        firstChunkWatchdogWork = nil
        lastRecoveryStartedAt = .now()
        validChunkStreakSinceRecovery = 0
        identicalSentinelStreak = 0

        print(
            "[HeadphonesEEG] streaming recovery strategy=fullReconnect #\(fullReconnectAttempts) reason=\(reason) " +
                "name=\(info.name) address=\(info.address) chunks=\(chunkCount) batt=\(batteryLogLabel())"
        )

        sensorCommandQueue.async { [weak self] in
            guard let self else { return }
            if let sensor = self.sensor {
                self.logSensorSnapshot(sensor, label: "pre-full-reconnect")
                sensor.setSignalDataCallback(nil)
                sensor.setResistCallback(nil)
                if sensor.isSupportedCommand(.stopSignal) {
                    sensor.execCommand(.stopSignal)
                    print("[HeadphonesEEG] full reconnect ExecCommand(stopSignal)")
                }
                if sensor.isSupportedCommand(.stopResist) {
                    sensor.execCommand(.stopResist)
                    print("[HeadphonesEEG] full reconnect ExecCommand(stopResist)")
                }
                if sensor.isSupportedCommand(.idle) {
                    sensor.execCommand(.idle)
                    print("[HeadphonesEEG] full reconnect ExecCommand(idle)")
                }
                sensor.disconnect()
                print("[HeadphonesEEG] full reconnect disconnect() returned")
            }

            self.deviceQueue.async { [weak self] in
                guard let self else { return }
                self.sensor = nil
                self.connected = false
                self.connectionCallbackCount = 0

                self.runOnScannerQueue { [weak self] in
                    guard let self else { return }
                    self.scanner?.stopScan()
                    let filter = [NTSensorFamily.leHeadPhones2.rawValue]
                    guard let scanner = NTScanner(sensorFamily: filter) else {
                        print("[HeadphonesEEG] full reconnect failed — could not create NTScanner")
                        self.streamingRecoveryInProgress = false
                        self.scheduleScanRetry(reason: "reconnect-scanner-failed")
                        return
                    }
                    self.scanner = scanner
                    print("[HeadphonesEEG] full reconnect scanner recreated retained=\(ObjectIdentifier(scanner))")

                    self.sensorCommandQueue.async { [weak self] in
                        guard let self else { return }
                        let created = scanner.createSensor(info)
                        self.deviceQueue.async { [weak self] in
                            guard let self else { return }
                            self.streamingRecoveryInProgress = false
                            if created == nil {
                                print("[HeadphonesEEG] full reconnect failed — createSensor returned nil")
                                self.scheduleScanRetry(reason: "reconnect-create-sensor-failed")
                                return
                            }
                            print("[HeadphonesEEG] full reconnect createSensor ok — reconnecting")
                            self.beginConnect(created: created, info: info)
                        }
                    }
                }
            }
        }
    }

    private func handleBatteryUpdate(_ power: Int, origin: String) {
        let prev = lastBatteryPercent
        lastBatteryPercent = power
        let suspiciousEarlyRead = power <= 5 && chunkCount < 10
        let sensorState = sensor.map { Self.describeState($0.state) } ?? "nil"
        let ampMode = sensor.map { Self.describeAmpMode($0.ampMode) } ?? "nil"
        let prevLabel = prev >= 0 ? "\(prev)%" : "none"
        print(
            "[HeadphonesEEG] battery \(origin)=\(power)% prev=\(prevLabel) suspiciousEarlyRead=\(suspiciousEarlyRead) " +
                "state=\(sensorState) ampMode=\(ampMode) chunks=\(chunkCount) " +
                "sentinelStreak=\(identicalSentinelStreak) signalRecoveries=\(consecutiveSignalRecoveries)"
        )
    }

    private func batteryLogLabel() -> String {
        lastBatteryPercent >= 0 ? "\(lastBatteryPercent)%" : "unknown"
    }

    private func logSentinelTransition(sensor: NTHeadphones2, packNum: UInt32, entering: Bool) {
        let strategy: String
        if consecutiveSignalRecoveries >= RelayConfiguration.streamingRecoveryMaxSignalRestarts {
            strategy = "fullReconnect-next"
        } else if streamingRecoveryInProgress {
            strategy = "recovery-in-progress"
        } else {
            strategy = "signalRestart-next"
        }
        let streakLabel = entering ? "1" : "\(identicalSentinelStreak)"
        print(
            "[HeadphonesEEG] sentinel \(entering ? "ENTER" : "EXIT") streak=\(streakLabel) " +
                "allChannels=\(RelayConfiguration.streamingSentinelVolts)V packNum=\(packNum) " +
                "batt=\(batteryLogLabel()) state=\(Self.describeState(sensor.state)) " +
                "ampMode=\(Self.describeAmpMode(sensor.ampMode)) chunks=\(chunkCount) " +
                "signalRecoveries=\(consecutiveSignalRecoveries) fullReconnects=\(fullReconnectAttempts) " +
                "recoveryStrategy=\(strategy)"
        )
    }

    private func noteValidChunkReceived() {
        validChunkStreakSinceRecovery += 1
        guard validChunkStreakSinceRecovery >= RelayConfiguration.validChunkStreakToResetRecovery else { return }
        guard consecutiveSignalRecoveries > 0 || fullReconnectAttempts > 0 else { return }

        print(
            "[HeadphonesEEG] recovery budget reset after \(validChunkStreakSinceRecovery) valid chunks " +
                "(was signalRecoveries=\(consecutiveSignalRecoveries) fullReconnects=\(fullReconnectAttempts))"
        )
        consecutiveSignalRecoveries = 0
        fullReconnectAttempts = 0
        validChunkStreakSinceRecovery = 0
    }

    /// Signal-only EEG path — resist channels off (validated by headphones2-truth-test on iPad).
    private func configureHeadphonesAmplifier(_ sensor: NTHeadphones2) {
        let param = NTHeadphones2AmplifierParam(
            chSignalUse1: true,
            chSignalUse2: true,
            chSignalUse3: true,
            chSignalUse4: true,
            chResistUse1: false,
            chResistUse2: false,
            chResistUse3: false,
            chResistUse4: false,
            chGain1: .gain6,
            chGain2: .gain6,
            chGain3: .gain6,
            chGain4: .gain6,
            current: .genCurr6nA
        )
        sensor.amplifierParam = param
        print(
            "[HeadphonesEEG] amplifier WRITE signal-only " +
                "ChSignalUse1-4=true ChResistUse1-4=false ChGain=gain6 Current=genCurr6nA"
        )
    }

    private func logAmplifierReadback(_ sensor: NTHeadphones2, label: String) {
        let readback = sensor.amplifierParam
        print(
            "[HeadphonesEEG] amplifier READ (\(label)) " +
                "ChSignalUse=\(readback.chSignalUse1),\(readback.chSignalUse2),\(readback.chSignalUse3),\(readback.chSignalUse4) " +
                "ChResistUse=\(readback.chResistUse1),\(readback.chResistUse2),\(readback.chResistUse3),\(readback.chResistUse4) " +
                "gains=\(readback.chGain1.rawValue),\(readback.chGain2.rawValue),\(readback.chGain3.rawValue),\(readback.chGain4.rawValue) " +
                "current=\(readback.current.rawValue) ampMode=\(Self.describeAmpMode(sensor.ampMode))"
        )
    }

    private func verifyAmplifierConfiguration(_ sensor: NTHeadphones2) {
        let readback = sensor.amplifierParam
        print(
            "[HeadphonesEEG] amplifier READ (pre-signal-after-write) " +
                "ChSignalUse=\(readback.chSignalUse1),\(readback.chSignalUse2),\(readback.chSignalUse3),\(readback.chSignalUse4) " +
                "ChResistUse=\(readback.chResistUse1),\(readback.chResistUse2),\(readback.chResistUse3),\(readback.chResistUse4) " +
                "ampMode=\(Self.describeAmpMode(sensor.ampMode))"
        )
        let mixedMode = readback.chResistUse1 || readback.chResistUse2 || readback.chResistUse3 || readback.chResistUse4
        if mixedMode {
            print(
                "[HeadphonesEEG] WARNING signal-only configure did not clear ChResistUse — " +
                    "EEG may collapse to identical all-channel plateau"
            )
        }
    }

    private func logSensorSnapshot(_ sensor: NTHeadphones2, label: String) {
        print(
            "[HeadphonesEEG] snapshot \(label) " +
                "state=\(Self.describeState(sensor.state)) ampMode=\(Self.describeAmpMode(sensor.ampMode)) " +
                "batt=\(sensor.battPower)% chunks=\(chunkCount)"
        )
    }

    private func stopSignalLocked() {
        guard let sensor, signalStarted || signalStartInFlight else { return }
        signalStarted = false
        signalStartInFlight = false
        sensorCommandQueue.async {
            sensor.setSignalDataCallback(nil)
            sensor.setResistCallback(nil)
            if sensor.isSupportedCommand(.stopSignal) {
                sensor.execCommand(.stopSignal)
            }
            if sensor.isSupportedCommand(.stopResist) {
                sensor.execCommand(.stopResist)
            }
        }
    }

    private func runOnScannerQueue(_ block: @escaping () -> Void) {
        #if os(iOS)
        if Thread.isMainThread {
            block()
        } else {
            DispatchQueue.main.async(execute: block)
        }
        #else
        deviceQueue.async(execute: block)
        #endif
    }

    private static var queueLabel: String {
        #if os(iOS)
        return "main"
        #else
        return "deviceQueue"
        #endif
    }

    private static func describeState(_ state: NTSensorState) -> String {
        switch state {
        case .inRange:
            return "inRange"
        case .outOfRange:
            return "outOfRange"
        @unknown default:
            return "unknown(\(state.rawValue))"
        }
    }

    private static func describeAmpMode(_ mode: NTSensorAmpMode) -> String {
        switch mode {
        case .invalid:
            return "invalid"
        case .powerDown:
            return "powerDown"
        case .idle:
            return "idle"
        case .signal:
            return "signal"
        case .resist:
            return "resist"
        case .signalResist:
            return "signalResist"
        @unknown default:
            return "unknown(\(mode.rawValue))"
        }
    }

    private static func isSentinelSample(_ values: [Float]) -> Bool {
        guard values.count == 4 else { return false }
        let sentinel = RelayConfiguration.streamingSentinelVolts
        let tol = Float(1e-4)
        return values.allSatisfy { abs($0 - sentinel) <= tol }
    }

    private static func msSinceLastValidChunk(_ lastValidNs: UInt64) -> UInt64 {
        guard lastValidNs > 0 else { return UInt64.max }
        let delta = DispatchTime.now().uptimeNanoseconds &- lastValidNs
        return delta / 1_000_000
    }

    private func broadcastSignal(_ data: [NTHeadphones2SignalData], sensor: NTHeadphones2) {
        guard !data.isEmpty else { return }

        var ch1: [Float] = []
        var ch2: [Float] = []
        var ch3: [Float] = []
        var ch4: [Float] = []
        ch1.reserveCapacity(data.count)
        ch2.reserveCapacity(data.count)
        ch3.reserveCapacity(data.count)
        ch4.reserveCapacity(data.count)

        for sample in data {
            ch1.append(sample.ch1.floatValue)
            ch2.append(sample.ch2.floatValue)
            ch3.append(sample.ch3.floatValue)
            ch4.append(sample.ch4.floatValue)
        }

        let firstFour = [ch1.first ?? 0, ch2.first ?? 0, ch3.first ?? 0, ch4.first ?? 0]
        let identical = ch1.elementsEqual(ch2) && ch2.elementsEqual(ch3) && ch3.elementsEqual(ch4)
        let sentinel = Self.isSentinelSample(firstFour)

        if sentinel {
            let prevStreak = identicalSentinelStreak
            identicalSentinelStreak += 1
            validChunkStreakSinceRecovery = 0
            if prevStreak == 0 {
                logSentinelTransition(sensor: sensor, packNum: data[0].packNum, entering: true)
            } else if identicalSentinelStreak % 25 == 0 {
                print(
                    "[HeadphonesEEG] sentinel frame streak=\(identicalSentinelStreak) " +
                        "allChannels=\(RelayConfiguration.streamingSentinelVolts)V " +
                        "ampMode=\(Self.describeAmpMode(sensor.ampMode)) " +
                        "state=\(Self.describeState(sensor.state)) packNum=\(data[0].packNum) — dropping fanout"
                )
            }
            if identicalSentinelStreak >= RelayConfiguration.sentinelStreakBeforeRecovery {
                recoverStreaming(sensor: sensor, reason: "sentinel-0.4V-streak-sustained")
            } else if identicalSentinelStreak >= RelayConfiguration.sentinelStreakWithStallMin,
                      Self.msSinceLastValidChunk(lastValidChunkWallNs) >= RelayConfiguration.sentinelRecoveryMinGapSinceValidMs {
                recoverStreaming(sensor: sensor, reason: "sentinel-0.4V-streak-with-stall")
            }
            return
        }

        if identicalSentinelStreak > 0 {
            logSentinelTransition(sensor: sensor, packNum: data[0].packNum, entering: false)
        }
        identicalSentinelStreak = 0
        noteValidChunkReceived()

        if chunkCount == 0 {
            firstChunkWatchdogWork?.cancel()
            firstChunkWatchdogWork = nil
            print(
                "[HeadphonesEEG] first chunk received packNum=\(data[0].packNum) " +
                    "A1=\(String(format: "%.4e", firstFour[0])) C3=\(String(format: "%.4e", firstFour[1])) " +
                    "C4=\(String(format: "%.4e", firstFour[2])) A2=\(String(format: "%.4e", firstFour[3])) V"
            )
        }

        let payload = EEGWebSocketPayload(
            labels: RelayConfiguration.defaultChannelLabels,
            samples: [ch1, ch2, ch3, ch4],
            timestamp: sequence
        )
        sequence &+= 1

        chunkCount &+= 1
        lastValidChunkWallNs = DispatchTime.now().uptimeNanoseconds
        let verbose = chunkCount <= 5 || chunkCount % 200 == 0
        if verbose {
            let firstPack = data[0].packNum
            print(
                "[HeadphonesEEG] chunk #\(chunkCount) samples=\(data.count) packNum=\(firstPack) " +
                    "A1=\(String(format: "%.4e", firstFour[0])) C3=\(String(format: "%.4e", firstFour[1])) " +
                    "C4=\(String(format: "%.4e", firstFour[2])) A2=\(String(format: "%.4e", firstFour[3])) V " +
                    "identicalChannels=\(identical) ampMode=\(Self.describeAmpMode(sensor.ampMode))"
            )
        }

        do {
            fanout.broadcastJSON(try payload.encodedJSON())
        } catch {
            print("[HeadphonesEEG] JSON encode failed: \(error)")
        }
    }
}
