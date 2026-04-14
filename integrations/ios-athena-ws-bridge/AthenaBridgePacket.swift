import Foundation

/// Normalized JSON envelope for Athena → NeuroFlo WebSocket PoC (v1).
/// Keep in sync with `public/athena-bridge-dev.html` consumer (parse JSON).
public struct AthenaBridgePacketV1: Encodable {
    public let v: Int
    public let k: String
    /// Muse / LibMuse device timestamp when available (units depend on SDK — document after verifying).
    public let td: Double?
    /// Host monotonic-ish time for skew debugging (seconds since 1970).
    public let th: Double
    public let pr: Int?
    public let pn: String?
    /// EEG samples in microvolts, SDK channel order (typically 4 values: TP9, AF7, AF8, TP10).
    public let u: [Double]

    public init(
        td: Double?,
        packetTypeRaw: Int?,
        packetTypeName: String?,
        microvolts: [Double]
    ) {
        self.v = 1
        self.k = "eeg"
        self.td = td
        self.th = Date().timeIntervalSince1970
        self.pr = packetTypeRaw
        self.pn = packetTypeName
        self.u = microvolts
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
