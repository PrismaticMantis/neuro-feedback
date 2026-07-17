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

/// WebSocket JSON frame carrying per-channel electrode resistance (ohms) during the setup
/// contact probe. This is the honest, hardware-native contact signal (`CommandStartResist`),
/// distinct from the `eeg` signal frames used for the session.
///
/// `values[i]` is `null` when the SDK reports a non-positive, non-finite, or open resistance.
/// The UI must treat null as invalid/off-head, never as good contact. Parsed by
/// `src/lib/eeg/brainbit-bridge-eeg-device.ts`.
public struct ResistWebSocketPayload: Codable, Sendable, Equatable {
    public static let messageType = "resist"

    public let type: String
    public let labels: [String]
    /// Per-channel electrode resistance in ohms; `null` = invalid, open, or no skin contact.
    public let values: [Float?]
    public let channelCount: Int
    public let timestamp: UInt64

    public init(labels: [String], values: [Float?], timestamp: UInt64) {
        self.type = Self.messageType
        self.labels = labels
        self.values = values
        self.channelCount = values.count
        self.timestamp = timestamp
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
