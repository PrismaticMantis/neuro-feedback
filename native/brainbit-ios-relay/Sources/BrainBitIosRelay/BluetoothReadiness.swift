#if os(iOS)
import CoreBluetooth
import Foundation

/// Logs CoreBluetooth manager state before neurosdk2 scan (iOS only).
final class BluetoothReadiness: NSObject, CBCentralManagerDelegate, @unchecked Sendable {
    static let shared = BluetoothReadiness()

    private let lock = NSLock()
    private var manager: CBCentralManager?
    private var pendingReady: [((Bool) -> Void)] = []

    private override init() {
        super.init()
    }

    func logSnapshot(label: String) {
        runOnMain { [self] in
            ensureManager()
            guard let manager else {
                print("[HeadphonesEEG] bluetooth \(label) — CBCentralManager unavailable")
                return
            }
            print(
                "[HeadphonesEEG] bluetooth \(label) " +
                    "state=\(Self.describeState(manager.state)) " +
                    "auth=\(Self.describeAuthorization()) " +
                    "onMainThread=\(Thread.isMainThread)"
            )
        }
    }

    /// Calls `completion(true)` when Bluetooth is powered on and authorized for use.
    func whenReady(completion: @escaping (Bool) -> Void) {
        runOnMain { [self] in
            ensureManager()
            guard let manager else {
                completion(false)
                return
            }

            switch manager.state {
            case .poweredOn:
                switch Self.authorizationStatus() {
                case .allowed:
                    print("[HeadphonesEEG] bluetooth ready check poweredOn authorizedForUse=true")
                    completion(true)
                case .pending:
                    lock.lock()
                    pendingReady.append(completion)
                    lock.unlock()
                    print(
                        "[HeadphonesEEG] bluetooth ready check poweredOn auth=notDetermined — " +
                            "waiting for user permission"
                    )
                case .denied:
                    print(
                        "[HeadphonesEEG] bluetooth not ready poweredOn auth=\(Self.describeAuthorization())"
                    )
                    completion(false)
                }
            case .unknown:
                lock.lock()
                pendingReady.append(completion)
                lock.unlock()
                print("[HeadphonesEEG] bluetooth ready check state=unknown — waiting for CBCentralManager update")
            default:
                print(
                    "[HeadphonesEEG] bluetooth not ready state=\(Self.describeState(manager.state)) " +
                        "auth=\(Self.describeAuthorization())"
                )
                completion(false)
            }
        }
    }

    @objc func centralManagerDidUpdateState(_ central: CBCentralManager) {
        print(
            "[HeadphonesEEG] bluetooth state update " +
                "state=\(Self.describeState(central.state)) auth=\(Self.describeAuthorization())"
        )

        lock.lock()
        let waiters = pendingReady
        pendingReady.removeAll()
        lock.unlock()

        guard central.state == .poweredOn else {
            for waiter in waiters {
                waiter(false)
            }
            return
        }

        switch Self.authorizationStatus() {
        case .allowed:
            for waiter in waiters {
                waiter(true)
            }
        case .pending:
            lock.lock()
            pendingReady.insert(contentsOf: waiters, at: 0)
            lock.unlock()
            print("[HeadphonesEEG] bluetooth state update poweredOn permission pending — keeping waiters")
        case .denied:
            for waiter in waiters {
                waiter(false)
            }
        }
    }

    private enum AuthorizationStatus {
        case allowed
        case pending
        case denied
    }

    private static func authorizationStatus() -> AuthorizationStatus {
        if #available(iOS 13.1, *) {
            switch CBManager.authorization {
            case .allowedAlways:
                return .allowed
            case .notDetermined:
                return .pending
            case .denied, .restricted:
                return .denied
            @unknown default:
                return .denied
            }
        }
        return .allowed
    }

    private static func isAuthorizedForUse() -> Bool {
        authorizationStatus() == .allowed
    }

    private func ensureManager() {
        if manager == nil {
            manager = CBCentralManager(delegate: self, queue: .main)
            print("[HeadphonesEEG] bluetooth CBCentralManager created on main queue")
        }
    }

    private func runOnMain(_ block: @escaping () -> Void) {
        if Thread.isMainThread {
            block()
        } else {
            DispatchQueue.main.async(execute: block)
        }
    }

    private static func describeAuthorization() -> String {
        if #available(iOS 13.0, *) {
            switch CBManager.authorization {
            case .notDetermined:
                return "notDetermined"
            case .restricted:
                return "restricted"
            case .denied:
                return "denied"
            case .allowedAlways:
                return "allowedAlways"
            @unknown default:
                return "unknown(\(CBManager.authorization.rawValue))"
            }
        }
        return "legacy"
    }

    private static func describeState(_ state: CBManagerState) -> String {
        switch state {
        case .unknown:
            return "unknown"
        case .resetting:
            return "resetting"
        case .unsupported:
            return "unsupported"
        case .unauthorized:
            return "unauthorized"
        case .poweredOff:
            return "poweredOff"
        case .poweredOn:
            return "poweredOn"
        @unknown default:
            return "unknown(\(state.rawValue))"
        }
    }
}
#endif
