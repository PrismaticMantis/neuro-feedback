import Foundation
import CapsuleBridge

// MARK: - C callback bridging
//
// Capsule exposes async work through C function pointers (`typedef void (*Handler)(...)`).
// Swift can pass a **top-level** or **fileprivate** function as `@convention(c)` only if it
// does not capture mutable outer state. We use fileprivate globals for:
// - completion flags (read by the main run loop after `clCClient_Update` delivers events)
// - synchronizing with the single-threaded `Update` pump
//
// The SDK is **single-threaded**: `clCClient_Update` must be called regularly; delegates
// (e.g. OnDevices) fire from that call chain.

/// `clCString` → Swift `String` (Capsule heap string; do not free from Swift).
private func stringFromCString(_ s: clCString?) -> String? {
    guard let s else { return nil }
    guard let ptr = clCString_CStr(s) else { return nil }
    return String(cString: ptr)
}

private enum DiscoveryState {
    /// Set to `true` when `OnDevices` fires (search finished or failed).
    /// C callback + main run loop are effectively single-threaded via `clCClient_Update`.
    nonisolated(unsafe) static var finished = false
}

/// State for the device connect → Signal → EEG path (read/written from C callbacks + main loop).
private enum DeviceRelayState {
    /// Matches `RawSignalExample.cpp`: device is created **inside** `OnDevices`, not after the discovery loop.
    nonisolated(unsafe) static var device: clCDevice?
    nonisolated(unsafe) static var deviceConnectedHandled = false
    nonisolated(unsafe) static var eegChunksLogged = 0
    nonisolated(unsafe) static var channelLabels: [String] = []
    nonisolated(unsafe) static var webSocketFanout: EEGWebSocketFanout?
}

private struct EEGWebSocketPayload: Codable {
    let type: String
    let labels: [String]
    let samples: [[Float]]
    let sampleCount: Int
    let channelCount: Int
    let timestamp: UInt64
}

/// C signature: `void (*)(clCDeviceLocator, clCDeviceInfoList, clCDeviceLocatorFailReason)`
private func onDevicesListCallback(
    _ locator: clCDeviceLocator?,
    _ list: clCDeviceInfoList?,
    _ reason: clCDeviceLocatorFailReason
) {
    // RawSignalExample.cpp: if (device != nullptr) return;
    if DeviceRelayState.device != nil {
        return
    }

    if reason != clC_DeviceLocatorFailReason_OK {
        print("Device locator finished with error: \(reason.rawValue) (\(locatorFailReasonDescription(reason)))")
        DiscoveryState.finished = true
        return
    }

    guard let list else {
        print("Device list is nil.")
        DiscoveryState.finished = true
        return
    }

    let count = clCDeviceInfoList_GetCount(list)
    print("Discovered \(count) device(s) for type NeiryHeadphones:")
    if count == 0 {
        print("  (none — ensure headphones are on and in range.)")
    } else {
        for i in 0..<count {
            guard let info = clCDeviceInfoList_GetDeviceInfo(list, i) else { continue }
            let id = stringFromCString(clCDeviceInfo_GetID(info)) ?? "(nil)"
            let name = stringFromCString(clCDeviceInfo_GetName(info)) ?? "(nil)"
            let desc = stringFromCString(clCDeviceInfo_GetDescription(info)) ?? "(nil)"
            let typeRaw = clCDeviceInfo_GetType(info).rawValue
            print("  [\(i)] type(raw)=\(typeRaw) id=\(id)")
            print("        name=\(name)")
            print("        description=\(desc)")
        }

        // RawSignalExample.cpp: create device, register delegates, Connect — all inside this callback.
        guard let locator else {
            DiscoveryState.finished = true
            return
        }
        guard let first = clCDeviceInfoList_GetDeviceInfo(list, 0) else {
            DiscoveryState.finished = true
            return
        }
        let id = stringFromCString(clCDeviceInfo_GetID(first)) ?? ""
        guard !id.isEmpty else {
            print("Device id string empty; cannot CreateDevice.")
            DiscoveryState.finished = true
            return
        }
        let created = id.withCString { clCDeviceLocator_CreateDevice(locator, $0) }
        guard let created else {
            print("clCDeviceLocator_CreateDevice failed.")
            DiscoveryState.finished = true
            return
        }
        DeviceRelayState.device = created
        DeviceRelayState.deviceConnectedHandled = false
        DeviceRelayState.eegChunksLogged = 0

        let connDelegate = clCDevice_GetOnConnectionStateChangedEvent(created)
        clCDeviceDelegateConnectionState_Set(connDelegate, onDeviceConnectionState)
        let eegDelegate = clCDevice_GetOnEEGDataEvent(created)
        clCDeviceDelegateEEGData_Set(eegDelegate, onDeviceEEGData)

        print("Connecting device id=\(id) …")
        clCDevice_Connect(created)
    }
    DiscoveryState.finished = true
}

private func locatorFailReasonDescription(_ r: clCDeviceLocatorFailReason) -> String {
    switch r {
    case clC_DeviceLocatorFailReason_OK:
        return "OK"
    case clC_DeviceLocatorFailReason_BluetoothDisabled:
        return "Bluetooth disabled or adapter missing"
    case clC_DeviceLocatorFailReason_Unknown:
        return "Unknown"
    default:
        return "other(\(r.rawValue))"
    }
}

// MARK: - Client connection delegates (parity with Mac CapsuleClientExample)

private func clientErrorDescription(_ e: clCError) -> String {
    switch e {
    case clC_Error_OK:
        return "OK"
    case clC_Error_FailedToConnect:
        return "FailedToConnect"
    case clC_Error_FailedToInitConnection:
        return "FailedToInitConnection"
    case clC_Error_FailedToInitialize:
        return "FailedToInitialize"
    case clC_Error_DeviceError:
        return "DeviceError"
    case clC_Error_IndividualNFBNotCalibrated:
        return "IndividualNFBNotCalibrated"
    case clC_Error_NotReceived:
        return "NotReceived"
    case clC_Error_UnlicensedAccess:
        return "UnlicensedAccess"
    case clC_Error_UNKNOWN:
        return "UNKNOWN"
    default:
        return "other(\(e.rawValue))"
    }
}

private func disconnectReasonDescription(_ r: clCDisconnectReason) -> String {
    switch r {
    case clC_DR_UserRequested:
        return "UserRequested"
    case clC_DR_Destruction:
        return "Destruction"
    case clC_DR_FatalError:
        return "FatalError"
    default:
        return "other(\(r.rawValue))"
    }
}

private func onClientConnected(_ client: clCClient?) {
    _ = client
    print("Capsule: OnConnected")
}

private func onClientError(_ client: clCClient?, _ err: clCError) {
    _ = client
    print("Capsule: OnError — \(err.rawValue) (\(clientErrorDescription(err)))")
}

private func onClientDisconnected(_ client: clCClient?, _ reason: clCDisconnectReason) {
    _ = client
    print("Capsule: OnDisconnected — \(reason.rawValue) (\(disconnectReasonDescription(reason)))")
}

// MARK: - Device + EEG (Mac FilteredSignal / RawSignal-style flow)

/// `clCDeviceHandlerConnectionState` — Clang imports pointer params as `Optional` (see `swift build` error); must match for `@convention(c)`.
private func onDeviceConnectionState(_ device: clCDevice?, _ state: clCDeviceConnectionState) {
    guard let device, state == clC_SE_Connected else { return }
    if DeviceRelayState.deviceConnectedHandled { return }
    DeviceRelayState.deviceConnectedHandled = true

    print("Device connected.")

    // RawSignalExample.cpp: SwitchMode(Signal) before reading channel names.
    clCDevice_SwitchMode(device, clC_DM_Signal)

    let chanNames = clCDevice_GetChannelNames(device)
    let chCount = clCDevice_GetChannelsCount(chanNames)
    var names: [String] = []
    for i in 0..<chCount {
        let n = stringFromCString(clCDevice_GetChannelNameByIndex(chanNames, i)) ?? "?"
        names.append(n)
    }
    print("channel count=\(chCount) names=\(names.joined(separator: ", "))")
    DeviceRelayState.channelLabels = names
}

/// `clCDeviceHandlerEEGData` — Clang imports opaque handles as optional pointers; signature must match `@convention(c)`.
private func onDeviceEEGData(_ device: clCDevice?, _ data: clCEEGTimedData?) {
    guard let device, let data else { return }
    _ = device
    let sampleCount = clCEEGTimedData_GetSamplesCount(data)
    let channelCount = clCEEGTimedData_GetChannelsCount(data)
    DeviceRelayState.eegChunksLogged += 1
    let n = DeviceRelayState.eegChunksLogged
    if n == 1 {
        print("EEG streaming: samples=\(sampleCount) channels=\(channelCount) (compact log; Ctrl+C to stop)")
    } else if n % 500 == 0 {
        print("EEG chunks so far: \(n)")
    }

    let labels: [String]
    if DeviceRelayState.channelLabels.count == Int(channelCount) {
        labels = DeviceRelayState.channelLabels
    } else {
        labels = (0..<Int(channelCount)).map { "ch\($0)" }
    }

    var samples: [[Float]] = []
    samples.reserveCapacity(Int(channelCount))
    for c in 0..<Int(channelCount) {
        var row: [Float] = []
        row.reserveCapacity(Int(sampleCount))
        for s in 0..<Int(sampleCount) {
            row.append(clCEEGTimedData_GetValue(data, Int32(c), Int32(s)))
        }
        samples.append(row)
    }

    let timestamp = sampleCount > 0 ? clCEEGTimedData_GetTimepoint(data, 0) : 0
    let payload = EEGWebSocketPayload(
        type: "eeg",
        labels: labels,
        samples: samples,
        sampleCount: Int(sampleCount),
        channelCount: Int(channelCount),
        timestamp: timestamp
    )
    if let fanout = DeviceRelayState.webSocketFanout {
        if let jsonData = try? JSONEncoder().encode(payload),
           let json = String(data: jsonData, encoding: .utf8)
        {
            fanout.broadcastJSON(json)
        } else if n == 1 {
            print("[EEG→WS] JSON encode failed — skipping broadcast")
        }
    } else if n == 1 {
        print("[EEG→WS] webSocketFanout is nil — skipping broadcast")
    }
}

@main
struct brainbit_capsule_relay {
    static func main() throws {
        let client = "BrainBitCapsuleRelay".withCString { clCClient_CreateWithName($0) }
        guard let client else {
            print("Capsule client create failed")
            exit(1)
        }
        defer { clCClient_Destroy(client) }

        "1.0.0".withCString { ver in
            clCClient_SetAppVersion(client, ver)
        }

        let onConnectedEvent = clCClient_GetOnConnectedEvent(client)
        clCClientDelegate_Set(onConnectedEvent, onClientConnected)
        let onErrorEvent = clCClient_GetOnErrorEvent(client)
        clCClientDelegateError_Set(onErrorEvent, onClientError)
        let onDisconnectedEvent = clCClient_GetOnDisconnectedEvent(client)
        clCClientDelegateDisconnectReason_Set(onDisconnectedEvent, onClientDisconnected)

        print("Connecting to Capsule (in-process, inproc://capsule)...")
        "inproc://capsule".withCString { addr in
            clCClient_Connect(client, addr)
        }

        let connectDeadline = Date().addingTimeInterval(20)
        while Date() < connectDeadline {
            clCClient_Update(client)
            if clCClient_IsConnected(client) {
                break
            }
            Thread.sleep(forTimeInterval: 0.002)
        }

        guard clCClient_IsConnected(client) else {
            print("Could not connect to Capsule within timeout. Is the Capsule runtime/service running?")
            exit(1)
        }
        print("Capsule client connected.")

        let wsFanout = EEGWebSocketFanout()
        DeviceRelayState.webSocketFanout = wsFanout
        let wsServer = try EEGWebSocketServer(host: "127.0.0.1", port: 8765, fanout: wsFanout)
        defer { wsServer.shutdown() }
        print("WebSocket server (SwiftNIO): ws://127.0.0.1:8765/ws")

        guard let locator = clCClient_ChooseDeviceType(client, clC_DT_NeiryHeadphones) else {
            print("clCClient_ChooseDeviceType(NeiryHeadphones) returned nil.")
            exit(1)
        }
        defer { clCDeviceLocator_Destroy(locator) }
        defer {
            if let d = DeviceRelayState.device {
                clCDevice_Release(d)
                DeviceRelayState.device = nil
            }
        }

        let devicesDelegate = clCDeviceLocator_GetOnDevicesEvent(locator)
        clCDeviceLocatorDelegateDeviceInfoList_Set(devicesDelegate, onDevicesListCallback)

        DiscoveryState.finished = false
        print("Requesting device scan (NeiryHeadphones, 10 s search window)...")
        clCDeviceLocator_RequestDevices(locator, 10)

        let searchDeadline = Date().addingTimeInterval(25)
        while Date() < searchDeadline, !DiscoveryState.finished {
            clCClient_Update(client)
            Thread.sleep(forTimeInterval: 0.002)
        }

        if !DiscoveryState.finished {
            print("Timed out waiting for OnDevices callback (still pump Update in a full app).")
        }

        guard DeviceRelayState.device != nil else {
            print("No NeiryHeadphones device created from discovery. Done.")
            return
        }

        let noEegDeadline = Date().addingTimeInterval(120)
        while Date() < noEegDeadline, DeviceRelayState.eegChunksLogged == 0 {
            clCClient_Update(client)
            Thread.sleep(forTimeInterval: 0.002)
        }

        if DeviceRelayState.eegChunksLogged == 0 {
            print("Timed out with no EEG chunks (check headset, mode, and Update pump).")
            return
        }

        print("Relay running — broadcasting EEG JSON on ws://127.0.0.1:8765/ws (Ctrl+C to stop).")
        while true {
            clCClient_Update(client)
            Thread.sleep(forTimeInterval: 0.002)
        }
    }
}
