import Foundation

/// Entry point for the iOS BrainBit Headphones relay (neurosdk2 → localhost WebSocket JSON).
public enum BrainBitIosRelay {
    public static let skeletonVersion = "0.2.0-neurosdk2"

    /// Starts WebSocket server and neurosdk2 Headphones scan/connect/stream.
    public static func start() async throws -> RelayStatus {
        try startSync()
    }

    /// Synchronous entry for CLI / run-loop hosts.
    public static func startSync() throws -> RelayStatus {
        try RelayRuntime.shared.start()
    }

    /// Stops device streaming and tears down the WebSocket server.
    public static func stop() async {
        RelayRuntime.shared.stop()
    }

    public static var status: RelayStatus {
        RelayRuntime.shared.currentStatus()
    }
}

public enum RelayError: Error, Sendable, Equatable {
    case notImplemented(String)
    case startFailed(String)
}

extension RelayError: LocalizedError {
    public var errorDescription: String? {
        switch self {
        case let .notImplemented(feature):
            return "BrainBit iOS relay not implemented: \(feature)"
        case let .startFailed(reason):
            return "BrainBit iOS relay failed to start: \(reason)"
        }
    }
}
