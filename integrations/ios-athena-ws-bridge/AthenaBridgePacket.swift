import Foundation

/// Normalized JSON envelope for Athena → NeuroFlo WebSocket bridge (v2).
/// TypeScript mirror: `src/lib/eeg/athena-bridge-packet.ts`
public struct AthenaBridgePacket: Encodable {
    public let v: Int
    public let k: String
    /// Monotonic index for each packet actually sent (after throttling).
    public let seq: Int
    /// LibMuse / device timestamp when available.
    public let td: Double?
    /// Document interpretation of `td`, e.g. "unknown" until verified against SDK.
    public let tdUnit: String
    /// Host Unix time (seconds since 1970).
    public let th: Double
    public let pr: Int?
    public let pn: String?
    /// Channel labels matching `u` order (e.g. Muse horseshoe).
    public let labels: [String]
    /// Microvolts per channel, same order as `labels`.
    public let u: [Double]
    /// Effective rate of `u` rows on this bridge (Hz) — one row per packet, typically ~throttle rate (~50 Hz).
    public let sr: Double?
    /// `true` during brief warmup before measured send spacing is stable.
    public let srAssumed: Bool

    public init(
        seq: Int,
        td: Double?,
        tdUnit: String,
        packetTypeRaw: Int?,
        packetTypeName: String?,
        labels: [String],
        microvolts: [Double],
        nominalSampleRateHz: Double?,
        sampleRateAssumed: Bool
    ) {
        precondition(
            labels.count == microvolts.count,
            "AthenaBridgePacket: labels.count (\(labels.count)) must equal microvolts.count (\(microvolts.count))"
        )
        precondition(seq >= 1, "AthenaBridgePacket: seq must be >= 1")
        self.v = 2
        self.k = "eeg"
        self.seq = seq
        self.td = td
        self.tdUnit = tdUnit
        self.th = Date().timeIntervalSince1970
        self.pr = packetTypeRaw
        self.pn = packetTypeName
        self.labels = labels
        self.u = microvolts
        self.sr = nominalSampleRateHz
        self.srAssumed = sampleRateAssumed
    }

    public func jsonData() throws -> Data {
        let enc = JSONEncoder()
        enc.outputFormatting = [.sortedKeys]
        return try enc.encode(self)
    }

    public func jsonString() throws -> String {
        guard let s = String(data: try jsonData(), encoding: .utf8) else {
            throw NSError(domain: "AthenaBridge", code: 1, userInfo: [NSLocalizedDescriptionKey: "UTF-8 encode failed"])
        }
        return s
    }
}
