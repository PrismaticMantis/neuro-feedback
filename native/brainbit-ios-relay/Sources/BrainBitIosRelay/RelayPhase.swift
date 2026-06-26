import Foundation

/// Relay lifecycle exposed to JS (mirrors `BrainBitRelayPhase` in `useBrainBitRelayStatus.ts`).
public enum RelayPhase: String, Sendable, Equatable {
    case starting
    case ready
    case failed
    case stopped
}

public struct RelayStatus: Sendable, Equatable {
    public let phase: RelayPhase
    public let message: String?

    public init(phase: RelayPhase, message: String? = nil) {
        self.phase = phase
        self.message = message
    }
}
