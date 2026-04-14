import Foundation
import os

/**
 * Drop-in replacement for per-packet NSLog/print in LibMuse EEG callbacks.
 * Heavy console I/O can stall runloops and contribute to URLSession “pending events” warnings.
 *
 * Use from your graph path only for occasional summaries; keep full-rate work for UI/graph only.
 */
public enum AthenaBridgeDebugLog {
    private static let log = Logger(subsystem: "AthenaBridge", category: "debug")

    private static var lastAt: [String: CFAbsoluteTime] = [:]
    private static let lock = NSLock()

    /// When true, `eegPacket` may log every `verboseMinInterval` seconds (still not per-sample).
    public static var verboseEegEnabled = false

    /// Minimum wall time between verbose EEG summaries when `verboseEegEnabled` is true.
    public static var verboseMinInterval: TimeInterval = 0.5

    /**
     * Rate-limited log (default ~1 line per 2s per key). Use key `"eeg"` in `receive(_ packet: IXNMuseDataPacket, ...)`.
     */
    public static func throttled(
        _ key: String,
        interval: TimeInterval = 2.0,
        _ message: @autoclosure () -> String
    ) {
        let now = CFAbsoluteTimeGetCurrent()
        lock.lock()
        let last = lastAt[key, default: 0]
        if now - last < interval {
            lock.unlock()
            return
        }
        lastAt[key] = now
        lock.unlock()
        log.info("\(message(), privacy: .public)")
    }

    /// Optional richer trace while debugging; off by default.
    public static func eegPacket(_ message: @autoclosure () -> String) {
        guard verboseEegEnabled else { return }
        throttled("eeg-verbose", interval: verboseMinInterval, message())
    }

    /// Lifecycle / one-shot events (connect, bridge enabled, etc.) — keep rare.
    public static func lifecycle(_ message: @autoclosure () -> String) {
        log.info("\(message(), privacy: .public)")
    }
}
