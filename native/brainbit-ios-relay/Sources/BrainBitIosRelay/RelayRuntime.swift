import Foundation

final class RelayRuntime: @unchecked Sendable {
    static let shared = RelayRuntime()

    private let lock = NSLock()
    private var fanout: EEGWebSocketFanout?
    private var server: EEGWebSocketServer?
    private var headphonesRelay: HeadphonesEEGRelay?
    private var status = RelayStatus(phase: .stopped)

    private init() {}

    func currentStatus() -> RelayStatus {
        lock.lock()
        defer { lock.unlock() }
        return status
    }

    func start() throws -> RelayStatus {
        lock.lock()
        if server != nil {
            let existing = status
            lock.unlock()
            return existing
        }

        status = RelayStatus(phase: .starting, message: "Starting WebSocket server")
        lock.unlock()

        do {
            let fanout = EEGWebSocketFanout()
            let headphonesRelay = HeadphonesEEGRelay(fanout: fanout)
            fanout.onClientConnected = { [weak headphonesRelay] in
                headphonesRelay?.resumeScanIfNeeded(reason: "ws-client")
            }
            fanout.onCommand = { [weak headphonesRelay] cmd in
                headphonesRelay?.handleClientCommand(cmd)
            }
            let server = try EEGWebSocketServer(
                host: RelayConfiguration.webSocketHost,
                port: RelayConfiguration.webSocketPort,
                fanout: fanout
            )
            headphonesRelay.start()

            lock.lock()
            self.fanout = fanout
            self.server = server
            self.headphonesRelay = headphonesRelay
            self.status = RelayStatus(
                phase: .ready,
                message: "Scanning Headphones — EEG on \(RelayConfiguration.webSocketURLString)"
            )
            let ready = status
            lock.unlock()

            print("[BrainBitIosRelay] ready — \(RelayConfiguration.webSocketURLString)")
            return ready
        } catch {
            lock.lock()
            status = RelayStatus(phase: .failed, message: String(describing: error))
            lock.unlock()
            throw RelayError.startFailed(String(describing: error))
        }
    }

    func stop() {
        lock.lock()
        let relay = headphonesRelay
        let srv = server
        headphonesRelay = nil
        server = nil
        fanout = nil
        status = RelayStatus(phase: .stopped, message: "Relay stopped")
        lock.unlock()

        relay?.stop()
        srv?.shutdown()
        print("[BrainBitIosRelay] stopped")
    }
}
