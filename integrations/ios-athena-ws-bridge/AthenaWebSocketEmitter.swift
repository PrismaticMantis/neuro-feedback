import Foundation

/// Minimal WebSocket client for sending JSON text to the NeuroFlo relay (`npm run athena-bridge`).
/// Thread-safe enough for PoC: call `send` from the main queue / LibMuse callback queue only.
public final class AthenaWebSocketEmitter: NSObject, URLSessionWebSocketDelegate {
    private var task: URLSessionWebSocketTask?
    private lazy var session: URLSession = {
        URLSession(configuration: .default, delegate: self, delegateQueue: OperationQueue.main)
    }()

    public private(set) var isConnected = false

    /// Example: `URL(string: "ws://192.168.1.10:8765")` — use your Mac LAN IP while relay runs.
    public func connect(url: URL) {
        disconnect()
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

    public func send(packet: AthenaBridgePacketV1) {
        guard let t = task else { return }
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
