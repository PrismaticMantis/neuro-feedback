import Foundation
import os

/// WebSocket client for the NeuroFlo relay (`npm run athena-bridge`).
/// Throttles outbound packets to reduce relay/browser load; `seq` increments only for sends that go out.
public final class AthenaWebSocketEmitter: NSObject, URLSessionWebSocketDelegate {
    private static let log = Logger(subsystem: "AthenaBridge", category: "websocket")

    /// Standard four-channel Muse order; `microvolts.count` must match.
    public static let defaultQuadLabels: [String] = ["TP9", "AF7", "AF8", "TP10"]
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

    /// Convenience for four Muse EEG channels — emits full v2 with `labels` = `defaultQuadLabels`.
    public func sendQuadEeg(
        td: Double?,
        tdUnit: String,
        packetTypeRaw: Int?,
        packetTypeName: String?,
        microvolts: [Double],
        nominalSampleRateHz: Double?,
        sampleRateAssumed: Bool
    ) {
        precondition(
            microvolts.count == Self.defaultQuadLabels.count,
            "sendQuadEeg: expected \(Self.defaultQuadLabels.count) channels, got \(microvolts.count)"
        )
        send(
            td: td,
            tdUnit: tdUnit,
            packetTypeRaw: packetTypeRaw,
            packetTypeName: packetTypeName,
            labels: Self.defaultQuadLabels,
            microvolts: microvolts,
            nominalSampleRateHz: nominalSampleRateHz,
            sampleRateAssumed: sampleRateAssumed
        )
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
                    if AthenaBridgeWsLogThrottle.shouldEmit(key: "send", minInterval: 1.0) {
                        Self.log.error("send error: \(err.localizedDescription, privacy: .public)")
                    }
                }
            }
        } catch {
            if AthenaBridgeWsLogThrottle.shouldEmit(key: "encode", minInterval: 1.0) {
                Self.log.error("encode error: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    public func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        Self.log.info("WebSocket open")
    }

    public func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        isConnected = false
        Self.log.info("WebSocket closed: \(closeCode.rawValue, privacy: .public)")
    }
}

private enum AthenaBridgeWsLogThrottle {
    private static var lastAt: [String: CFAbsoluteTime] = [:]
    private static let lock = NSLock()

    static func shouldEmit(key: String, minInterval: TimeInterval) -> Bool {
        let now = CFAbsoluteTimeGetCurrent()
        lock.lock()
        defer { lock.unlock() }
        let last = lastAt[key, default: 0]
        if now - last < minInterval { return false }
        lastAt[key] = now
        return true
    }
}
