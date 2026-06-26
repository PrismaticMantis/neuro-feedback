import Foundation
@preconcurrency import neurosdk2

/// Minimal Headphones2 resist/signal truth test with explicit mode-separated amplifier profiles.
public enum Headphones2TruthTest {
    private static let resistDurationSec: TimeInterval = 20
    private static let signalDurationSec: TimeInterval = 20
    private static let scanTimeoutSec: TimeInterval = 20

    /// Serial queue for neurosdk2 connect/exec (matches relay sensorCommandQueue).
    private static let sensorCommandQueue = DispatchQueue(
        label: "headphones2-truth-test.sensor-commands",
        qos: .userInitiated
    )

    nonisolated(unsafe) private static var scanner: NTScanner?
    nonisolated(unsafe) private static var sensor: NTHeadphones2?
    nonisolated(unsafe) private static var scanTimeoutWork: DispatchWorkItem?
    nonisolated(unsafe) private static var resistCount: UInt64 = 0
    nonisolated(unsafe) private static var signalCount: UInt64 = 0
    nonisolated(unsafe) private static var lastAmpMode: NTSensorAmpMode = .invalid
    nonisolated(unsafe) private static var sequenceStarted = false
    nonisolated(unsafe) private static var connectionCallbackCount = 0
    nonisolated(unsafe) private static var connected = false
    nonisolated(unsafe) private static var resistAllInfStreak: UInt64 = 0
    nonisolated(unsafe) private static var signalIdenticalStreak: UInt64 = 0
    nonisolated(unsafe) private static var signalLastSpread: Float = -1

    public static func run() {
        print("[TruthTest] Headphones2 mode-separated resist/signal truth test")
        runOnMainQueue {
            #if os(iOS)
            TruthTestBluetoothReadiness.shared.whenReady { ready in
                runOnMainQueue {
                    guard ready else {
                        print("[TruthTest] FATAL — Bluetooth not ready (enable Bluetooth and allow permission)")
                        return
                    }
                    beginScanOnMainQueue()
                }
            }
            #else
            beginScanOnMainQueue()
            #endif
        }
    }

    private static func beginScanOnMainQueue() {
        let filter = [NTSensorFamily.leHeadPhones2.rawValue]
        guard let scanner = NTScanner(sensorFamily: filter) else {
            print("[TruthTest] FATAL — could not create NTScanner")
            exit(1)
        }

        self.scanner?.stopScan()
        self.scanner = scanner

        scanner.setSensorsCallback { sensors in
            runOnMainQueue {
                handleDiscovered(scanner: scanner, sensors: sensors)
            }
        }

        print(
            "[TruthTest] scan start family=Headphones2 timeout=\(Int(scanTimeoutSec))s " +
                "onMainThread=\(Thread.isMainThread)"
        )
        scanner.startScan()
        scheduleScanTimeout()
    }

    private static func scheduleScanTimeout() {
        scanTimeoutWork?.cancel()
        let work = DispatchWorkItem {
            guard sensor == nil, !sequenceStarted else { return }
            print(
                "[TruthTest] scan timeout — no Headphones found in \(Int(scanTimeoutSec))s " +
                    "(power on device and retry)"
            )
        }
        scanTimeoutWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + scanTimeoutSec, execute: work)
    }

    private static func cancelScanTimeout() {
        scanTimeoutWork?.cancel()
        scanTimeoutWork = nil
    }

    private static func handleDiscovered(scanner: NTScanner, sensors: [NTSensorInfo]) {
        guard sensor == nil else {
            print("[TruthTest] scan callback ignored — sensor already created")
            return
        }

        guard let info = sensors.first(where: { $0.sensFamily == .leHeadPhones2 }) ?? sensors.first else {
            return
        }

        cancelScanTimeout()
        scanner.stopScan()
        print("[TruthTest] found name=\(info.name) address=\(info.address) sn=\(info.serialNumber)")

        sensorCommandQueue.async {
            let created = scanner.createSensor(info)
            runOnMainQueue {
                beginConnect(created: created, info: info)
            }
        }
    }

    private static func beginConnect(created: NTSensor?, info: NTSensorInfo) {
        guard sensor == nil else { return }

        guard let headphones = created as? NTHeadphones2 else {
            print("[TruthTest] FATAL — createSensor did not return NTHeadphones2")
            exit(1)
        }

        sensor = headphones
        print(
            "[TruthTest] connect started name=\(info.name) " +
                "initialState=\(describeState(headphones.state)) " +
                "ampMode=\(describeAmpMode(headphones.ampMode))"
        )

        wireCallbacksUnityOrder(sensor: headphones)
        print("[TruthTest] callbacks registered (Unity order: ampMode → resist → signal) BEFORE connect")

        logSupportedCommands(headphones)

        headphones.setConnectionStateCallback { state in
            runOnMainQueue {
                handleConnectionState(state, origin: "callback", sensor: headphones)
            }
        }

        scheduleConnectionPolls(for: headphones)

        print("[TruthTest] connect() …")
        sensorCommandQueue.async {
            headphones.connect()
            let postConnectState = headphones.state
            print(
                "[TruthTest] connect() returned state=\(describeState(postConnectState)) " +
                    "ampMode=\(describeAmpMode(headphones.ampMode)) " +
                    "connectionCallbacks=\(connectionCallbackCount)"
            )
            runOnMainQueue {
                evaluateReadyToRunSequence(origin: "post-connect", sensor: headphones)
            }
        }
    }

    private static func scheduleConnectionPolls(for sensor: NTHeadphones2) {
        for delay in [0.5, 1.0, 2.0, 4.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                guard self.sensor === sensor, !sequenceStarted else { return }
                evaluateReadyToRunSequence(origin: "poll+\(delay)s", sensor: sensor)
            }
        }
    }

    private static func handleConnectionState(_ state: NTSensorState, origin: String, sensor: NTHeadphones2) {
        connectionCallbackCount += 1
        print(
            "[TruthTest] connection \(origin) #\(connectionCallbackCount): " +
                "state=\(describeState(state)) ampMode=\(describeAmpMode(sensor.ampMode)) " +
                "sequenceStarted=\(sequenceStarted)"
        )

        if state == .inRange {
            connected = true
            evaluateReadyToRunSequence(origin: origin, sensor: sensor)
            return
        }

        connected = false
    }

    private static func evaluateReadyToRunSequence(origin: String, sensor: NTHeadphones2) {
        guard self.sensor === sensor else { return }

        let state = sensor.state
        print(
            "[TruthTest] evaluate (\(origin)) state=\(describeState(state)) " +
                "ampMode=\(describeAmpMode(sensor.ampMode)) connected=\(connected) " +
                "sequenceStarted=\(sequenceStarted) connectionCallbacks=\(connectionCallbackCount)"
        )

        if state == .inRange {
            connected = true
        }

        guard !sequenceStarted else { return }

        if state == .inRange {
            runSequence(sensor: sensor)
            return
        }

        if origin == "post-connect" || origin.hasPrefix("poll+") {
            print("[TruthTest] still outOfRange at \(origin) — waiting for inRange or next poll")
        }
    }

    private static func wireCallbacksUnityOrder(sensor: NTHeadphones2) {
        sensor.setAmpModeCallback { mode in
            runOnMainQueue {
                let prev = lastAmpMode
                lastAmpMode = mode
                print("[TruthTest] ampMode \(describeAmpMode(prev)) → \(describeAmpMode(mode))")
            }
        }

        sensor.setResistCallback { data in
            runOnMainQueue {
                guard !data.isEmpty else { return }
                resistCount += 1
                let s = data[0]
                let values = [s.ch1.doubleValue, s.ch2.doubleValue, s.ch3.doubleValue, s.ch4.doubleValue]
                let spread = finiteSpread(values)
                let allInf = values.allSatisfy { $0.isInfinite }
                if allInf {
                    resistAllInfStreak += 1
                } else {
                    resistAllInfStreak = 0
                }
                if resistCount <= 5 || resistCount % 20 == 0 {
                    print(
                        "[TruthTest] RESIST #\(resistCount) packNum=\(s.packNum) " +
                            "A1=\(formatValue(values[0])) C3=\(formatValue(values[1])) " +
                            "C4=\(formatValue(values[2])) A2=\(formatValue(values[3])) spread=\(spread) " +
                            "allInf=\(allInf) ampMode=\(describeAmpMode(sensor.ampMode))"
                    )
                }
            }
        }

        sensor.setSignalDataCallback { data in
            runOnMainQueue {
                guard !data.isEmpty else { return }
                signalCount += 1
                let s = data[0]
                let values = [s.ch1.floatValue, s.ch2.floatValue, s.ch3.floatValue, s.ch4.floatValue]
                let spread = (values.max() ?? 0) - (values.min() ?? 0)
                signalLastSpread = spread
                if spread == 0 {
                    signalIdenticalStreak += 1
                } else {
                    signalIdenticalStreak = 0
                }
                if signalCount <= 5 || signalCount % 50 == 0 {
                    print(
                        "[TruthTest] SIGNAL #\(signalCount) packNum=\(s.packNum) " +
                            "A1=\(values[0]) C3=\(values[1]) C4=\(values[2]) A2=\(values[3]) spread=\(spread) " +
                            "identicalStreak=\(signalIdenticalStreak) ampMode=\(describeAmpMode(sensor.ampMode))"
                    )
                }
            }
        }
    }

    private static func runSequence(sensor: NTHeadphones2) {
        guard !sequenceStarted else { return }
        sequenceStarted = true

        print("[TruthTest] inRange — resist phase: idle → resist-only amp → StartResist")
        sensorCommandQueue.async {
            goIdle(sensor, label: "pre-resist")

            applyAmplifierProfile(sensor, profile: .resistOnly, label: "pre-resist")

            guard sensor.isSupportedCommand(.startResist) else {
                print("[TruthTest] StartResist NOT supported")
                runOnMainQueue {
                    startSignalPhase(sensor)
                }
                return
            }

            print(
                "[TruthTest] ExecCommand(startResist) ampMode=\(describeAmpMode(sensor.ampMode)) — " +
                    "lift pads / remove headphones during next \(Int(resistDurationSec))s"
            )
            sensor.execCommand(.startResist)
            print("[TruthTest] StartResist returned ampMode=\(describeAmpMode(sensor.ampMode))")

            DispatchQueue.main.asyncAfter(deadline: .now() + resistDurationSec) {
                stopResistAndStartSignal(sensor)
            }
        }
    }

    private enum AmplifierProfile {
        case resistOnly
        case signalOnly
    }

    private static func goIdle(_ sensor: NTHeadphones2, label: String) {
        guard sensor.isSupportedCommand(.idle) else {
            print("[TruthTest] idle skipped (\(label)) — not supported")
            return
        }
        print("[TruthTest] ExecCommand(idle) (\(label)) ampMode=\(describeAmpMode(sensor.ampMode))")
        sensor.execCommand(.idle)
        print("[TruthTest] idle returned ampMode=\(describeAmpMode(sensor.ampMode))")
    }

    private static func logAmplifierRead(_ sensor: NTHeadphones2, label: String) {
        let readback = sensor.amplifierParam
        print(
            "[TruthTest] amplifier READ (\(label)) " +
                "ChSignalUse=\(readback.chSignalUse1),\(readback.chSignalUse2),\(readback.chSignalUse3),\(readback.chSignalUse4) " +
                "ChResistUse=\(readback.chResistUse1),\(readback.chResistUse2),\(readback.chResistUse3),\(readback.chResistUse4) " +
                "gains=\(readback.chGain1.rawValue),\(readback.chGain2.rawValue),\(readback.chGain3.rawValue),\(readback.chGain4.rawValue) " +
                "current=\(readback.current.rawValue) ampMode=\(describeAmpMode(sensor.ampMode))"
        )
    }

    private static func applyAmplifierProfile(_ sensor: NTHeadphones2, profile: AmplifierProfile, label: String) {
        logAmplifierRead(sensor, label: "\(label)-before-write")

        let param: NTHeadphones2AmplifierParam
        switch profile {
        case .resistOnly:
            param = NTHeadphones2AmplifierParam(
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
        case .signalOnly:
            param = NTHeadphones2AmplifierParam(
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
        }

        sensor.amplifierParam = param
        logAmplifierRead(sensor, label: "\(label)-after-write")
    }

    private static func stopResistAndStartSignal(_ sensor: NTHeadphones2) {
        sensorCommandQueue.async {
            if sensor.isSupportedCommand(.stopResist) {
                sensor.execCommand(.stopResist)
                print(
                    "[TruthTest] ExecCommand(stopResist) total resist samples=\(resistCount) " +
                        "ampMode=\(describeAmpMode(sensor.ampMode))"
                )
            }

            if resistCount == 0 {
                print("[TruthTest] WARNING — zero resist samples")
            } else if resistAllInfStreak > 0 {
                print(
                    "[TruthTest] resist note — final streak allInf=\(resistAllInfStreak); " +
                        "inf usually means open/no-contact, not necessarily a broken callback"
                )
            }

            runOnMainQueue {
                startSignalPhase(sensor)
            }
        }
    }

    private static func startSignalPhase(_ sensor: NTHeadphones2) {
        sensorCommandQueue.async {
            print("[TruthTest] signal phase: stopResist → idle → signal-only amp → StartSignal")
            goIdle(sensor, label: "pre-signal")
            applyAmplifierProfile(sensor, profile: .signalOnly, label: "pre-signal")

            guard sensor.isSupportedCommand(.startSignal) else {
                print("[TruthTest] Finish — StartSignal not supported")
                runOnMainQueue {
                    finish()
                }
                return
            }

            print("[TruthTest] ExecCommand(startSignal) ampMode=\(describeAmpMode(sensor.ampMode)) — next \(Int(signalDurationSec))s")
            sensor.execCommand(.startSignal)
            print("[TruthTest] StartSignal returned ampMode=\(describeAmpMode(sensor.ampMode))")

            DispatchQueue.main.asyncAfter(deadline: .now() + signalDurationSec) {
                sensorCommandQueue.async {
                    if sensor.isSupportedCommand(.stopSignal) {
                        sensor.execCommand(.stopSignal)
                    }
                    print(
                        "[TruthTest] ExecCommand(stopSignal) total signal samples=\(signalCount) " +
                            "finalSpread=\(signalLastSpread) identicalStreak=\(signalIdenticalStreak) " +
                            "ampMode=\(describeAmpMode(sensor.ampMode))"
                    )
                    runOnMainQueue {
                        finish()
                    }
                }
            }
        }
    }

    private static func finish() {
        print("[TruthTest] DONE resist=\(resistCount) signal=\(signalCount)")
        if resistCount > 0 {
            print("[TruthTest] RESULT resist — callback produced data")
            if resistAllInfStreak > 10 {
                print(
                    "[TruthTest] RESULT resist — sustained inf suggests open/no-contact electrodes; " +
                        "check whether values change when lifting pads (valid resist path, bad contact state)"
                )
            } else {
                print("[TruthTest] RESULT resist — finite values observed; resist path may be usable for contact")
            }
        } else {
            print("[TruthTest] RESULT resist — NO data")
        }

        if signalCount > 0 {
            if signalIdenticalStreak >= 20 {
                print(
                    "[TruthTest] RESULT signal — sustained identical all-channel plateau " +
                        "(spread=0, streak=\(signalIdenticalStreak)) suggests invalid/saturated frames, " +
                        "often from resist bleed or wrong amp flags"
                )
            } else {
                print(
                    "[TruthTest] RESULT signal — channels stayed differentiated (finalSpread=\(signalLastSpread)); " +
                        "signal-only amp separation likely working"
                )
            }
        } else {
            print("[TruthTest] RESULT signal — NO data")
        }
        exit(0)
    }

    private static func formatValue(_ value: Double) -> String {
        if value.isInfinite { return value > 0 ? "inf" : "-inf" }
        if value.isNaN { return "nan" }
        return String(value)
    }

    private static func finiteSpread(_ values: [Double]) -> Double {
        let finite = values.filter { $0.isFinite }
        guard let minVal = finite.min(), let maxVal = finite.max() else { return .infinity }
        return maxVal - minVal
    }

    private static func logSupportedCommands(_ sensor: NTHeadphones2) {
        let cmds: [(NTSensorCommand, String)] = [
            (.startSignal, "startSignal"),
            (.stopSignal, "stopSignal"),
            (.startResist, "startResist"),
            (.stopResist, "stopResist"),
            (.startSignalAndResist, "startSignalAndResist"),
            (.stopSignalAndResist, "stopSignalAndResist"),
            (.idle, "idle"),
        ]
        let supported = cmds.filter { sensor.isSupportedCommand($0.0) }.map(\.1).joined(separator: ", ")
        print("[TruthTest] supported commands: \(supported)")
        print("[TruthTest] samplingFrequencyResist=\(sensor.samplingFrequencyResist.rawValue) ampMode=\(describeAmpMode(sensor.ampMode))")
    }

    private static func describeState(_ state: NTSensorState) -> String {
        switch state {
        case .inRange: return "inRange"
        case .outOfRange: return "outOfRange"
        @unknown default: return "unknown(\(state.rawValue))"
        }
    }

    private static func describeAmpMode(_ mode: NTSensorAmpMode) -> String {
        switch mode {
        case .invalid: return "invalid"
        case .powerDown: return "powerDown"
        case .idle: return "idle"
        case .signal: return "signal"
        case .resist: return "resist"
        case .signalResist: return "signalResist"
        @unknown default: return "unknown(\(mode.rawValue))"
        }
    }

    /// iOS neurosdk2 scanner must use the main dispatch queue (matches relay runOnScannerQueue).
    private static func runOnMainQueue(_ block: @escaping () -> Void) {
        if Thread.isMainThread {
            block()
        } else {
            DispatchQueue.main.async(execute: block)
        }
    }
}
