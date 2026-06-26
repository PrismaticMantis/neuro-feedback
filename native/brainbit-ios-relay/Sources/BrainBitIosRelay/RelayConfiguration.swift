import Foundation

/// Shared constants for the iOS relay and future Capacitor plugin.
public enum RelayConfiguration {
    public static let webSocketHost = "127.0.0.1"
    public static let webSocketPort = 8765
    public static let webSocketPath = "/ws"

    public static var webSocketURLString: String {
        "ws://\(webSocketHost):\(webSocketPort)\(webSocketPath)"
    }

    /// BrainBit Headphones default channel order (matches `brainbit-bridge-eeg-device.ts`).
    public static let defaultChannelLabels = ["A1", "C3", "C4", "A2"]

    public static let defaultChannelCount = defaultChannelLabels.count
    public static let nominalSampleRateHz = 250

    /// BLE scan window before giving up when no Headphones are in range.
    public static let deviceScanTimeoutSec = 15

    /// Pause between automatic scan retries after timeout or failure.
    public static let deviceScanRetryDelaySec = 2

    /// Log if connect/stream has not started by this deadline.
    public static let deviceConnectTimeoutSec = 20

    /// After StartSignal, log/recover if no EEG chunk arrives in this window.
    public static let firstChunkTimeoutSec = 8

    /// Consecutive Stop→Idle→Start recoveries before escalating to full sensor reconnect.
    public static let streamingRecoveryMaxSignalRestarts = 3

    /// Full disconnect→recreate→connect cycles after signal restarts fail.
    public static let streamingRecoveryMaxFullReconnects = 2

    /// Minimum gap between automatic recoveries (avoids SDK command pile-up).
    public static let streamingRecoveryCooldownSec: Double = 1.2

    /// Pause after Stop/Idle before amplifier configure + StartSignal (all signal starts, not only recovery).
    public static let signalStartSettleMs: UInt64 = 400

    /// Pause after Stop/Idle before amplifier configure + StartSignal on streaming recovery.
    public static let streamingRecoverySettleMs: UInt64 = 400

    /// Valid (non-sentinel) chunks in a row before resetting recovery budget.
    public static let validChunkStreakToResetRecovery: UInt64 = 25

    /** Consecutive sentinel frames before triggering recovery (sustained contamination). */
    public static let sentinelStreakBeforeRecovery = 12

    /** Shorter streak still requires this gap since last valid chunk (ms) before recovery. */
    public static let sentinelRecoveryMinGapSinceValidMs: UInt64 = 2800

    /** Minimum sentinel streak when paired with sentinelRecoveryMinGapSinceValidMs. */
    public static let sentinelStreakWithStallMin = 6

    /// One-time resist validation spike on first connect (Xcode logs only — not wired to Web UI).
    /// Prefer `headphones2-truth-test` executable for resist characterization.
    public static let resistValidationSpikeEnabled = false

    /** Duration of resist-only sampling before returning to signal-only EEG. */
    public static let resistValidationSpikeDurationSec = 25

    /// Identical all-channel value (volts) treated as invalid SDK/resist sentinel.
    public static let streamingSentinelVolts: Float = 0.4
}
