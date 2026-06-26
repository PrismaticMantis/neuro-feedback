import Foundation

/// WebSocket JSON frame broadcast to the React BrainBit bridge.
///
/// Shape matches `EEGWebSocketPayload` in `native/brainbit-capsule-relay/` and is validated by
/// `tryParseBrainBitEegJson` in `src/lib/eeg/brainbit-bridge-eeg-device.ts`.
public struct EEGWebSocketPayload: Codable, Sendable, Equatable {
    public static let messageType = "eeg"

    public let type: String
    public let labels: [String]
    /// `samples[channelIndex][sampleIndex]` in volts.
    public let samples: [[Float]]
    public let sampleCount: Int
    public let channelCount: Int
    public let timestamp: UInt64

    public init(
        labels: [String],
        samples: [[Float]],
        timestamp: UInt64
    ) {
        self.type = Self.messageType
        self.labels = labels
        self.samples = samples
        self.sampleCount = samples.first?.count ?? 0
        self.channelCount = samples.count
        self.timestamp = timestamp
    }

    /// Convenience initializer using default Headphones labels and empty rows.
    public init(
        channelCount: Int = RelayConfiguration.defaultChannelCount,
        sampleCount: Int,
        timestamp: UInt64 = 0
    ) {
        let labels = Array(RelayConfiguration.defaultChannelLabels.prefix(channelCount))
        let samples = (0..<channelCount).map { _ in [Float](repeating: 0, count: sampleCount) }
        self.init(labels: labels, samples: samples, timestamp: timestamp)
    }

    public func encodedJSON() throws -> String {
        let data = try JSONEncoder().encode(self)
        guard let json = String(data: data, encoding: .utf8) else {
            throw EncodingError.invalidValue(
                self,
                EncodingError.Context(
                    codingPath: [],
                    debugDescription: "UTF-8 encoding failed"
                )
            )
        }
        return json
    }
}
