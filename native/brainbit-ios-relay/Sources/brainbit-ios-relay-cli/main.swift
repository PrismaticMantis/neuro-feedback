import BrainBitIosRelay
import Foundation

@main
struct BrainBitIosRelayCLI {
    static func main() {
        do {
            let status = try BrainBitIosRelay.startSync()
            print("BrainBit iOS relay: phase=\(status.phase.rawValue) message=\(status.message ?? "—")")
            print("Listening at \(RelayConfiguration.webSocketURLString)")
            print("Scanning for BrainBit Headphones — wear device and wait for EEG chunks. Ctrl+C to stop.")

            #if os(macOS)
            // neurosdk2 / CoreBluetooth callbacks on macOS need a running main run loop.
            while true {
                RunLoop.main.run(mode: .default, before: Date(timeIntervalSinceNow: 3600))
            }
            #else
            RunLoop.main.run()
            #endif
        } catch {
            fputs("BrainBit iOS relay failed: \(error.localizedDescription)\n", stderr)
            exit(1)
        }
    }
}
