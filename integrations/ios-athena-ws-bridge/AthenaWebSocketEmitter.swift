import Foundation

/// WebSocket client for the NeuroFlo relay (`npm run athena-bridge`).
/// Throttles outbound packets to reduce relay/browser load; `seq` increments only for sends that go out.
public final class AthenaWebSocketEmitter: NSObject, URLSessionWebSocketDelegate {
    private var task: URLSessionWebSocketTask?
    private lazy var session: URLSession = {
        URLSession(configuration: .default, delegate: self, delegateQueue: OperationQueue.main)
    }()

    public private(set) var isConnected = false

    /// Minimum time between sends. Default ~50 Hz cap (20 ms).
    public var minSendInterval: TimeInterval = 1.0 / 50.0

    private var seqCounter: Int = 0
    private var lastSendAt: CFAbsoluteTime = 0

    public func connect(url: URL) {
        disconnect()
        seqCounter = 0
        lastSendAt = 0
        let t = session.webSocketTask(with: url)
        task = t
        t.resume()
        isConnected = true
        receiveLoop()
    }

    public func disconnect() {
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        isConnected = false
    }

    private func receiveLoop() {
        task?.receive { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .failure:
                self.isConnected = false
            case .success:
                self.receiveLoop()
            }
        }
    }

    /// Sends one v2 packet if throttle allows; otherwise drops silently (spam reduction).
    public func send(
        td: Double?,
        tdUnit: String,
        packetTypeRaw: Int?,
        packetTypeName: String?,
        labels: [String],
        microvolts: [Double],
        nominalSampleRateHz: Double?,
        sampleRateAssumed: Bool
    ) {
        guard let t = task else { return }
        let now = CFAbsoluteTimeGetCurrent()
        if now - lastSendAt < minSendInterval {
            return
        }
        lastSendAt = now
        seqCounter += 1
        let packet = AthenaBridgePacket(
            seq: seqCounter,
            td: td,
            tdUnit: tdUnit,
            packetTypeRaw: packetTypeRaw,
            packetTypeName: packetTypeName,
            labels: labels,
            microvolts: microvolts,
            nominalSampleRateHz: nominalSampleRateHz,
            sampleRateAssumed: sampleRateAssumed
        )
        do {
            let s = try packet.jsonString()
            t.send(.string(s)) { err in
                if let err = err {
                    NSLog("[AthenaBridge] send error: \(err.localizedDescription)")
                }
            }
        } catch {
            NSLog("[AthenaBridge] encode error: \(error.localizedDescription)")
        }
    }

    public func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        NSLog("[AthenaBridge] WebSocket open")
    }

    public func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        isConnected = false
        NSLog("[AthenaBridge] WebSocket closed: \(closeCode.rawValue)")
    }
}
