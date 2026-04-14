# Athena iOS → WebSocket bridge (PoC)

Copy these Swift files into **MuseStatsIosSwift** (or your LibMuse sample) and wire them from your existing `IXNMuseDataPacket` callback. Nothing here lives in the NeuroFlo web bundle at runtime.

## Normalized JSON (v2)

Single JSON object per **sent** frame. The emitter **throttles** outbound WebSocket messages (default max ~50 Hz); dropped frames are not assigned a `seq`.

| Field | Type | Meaning |
|-------|------|--------|
| `v` | `2` | Schema version |
| `k` | `"eeg"` | Message kind |
| `seq` | `number` | Monotonic send index (1-based) after connect; increments only when a packet is actually transmitted |
| `td` | `number?` | Device/SDK packet timestamp if available |
| `tdUnit` | `string` | How to read `td` (use `"unknown"` until LibMuse units are verified) |
| `th` | `number` | Host Unix time in seconds |
| `pr` | `number?` | Raw `packetType` enum value |
| `pn` | `string?` | Packet type name string |
| `labels` | `[string]` | Channel names matching `u` order (e.g. `["TP9","AF7","AF8","TP10"]`) |
| `u` | `[number]` | EEG microvolts per channel |
| `sr` | `number?` | Nominal sample rate (Hz) when set |
| `srAssumed` | `boolean` | `true` when `sr` is from preset/docs, not measured |

TypeScript types: `src/lib/eeg/athena-bridge-packet.ts`.

## Relay order (important)

The relay **broadcasts each message to every *other* connected client**. For messages to reach the browser, **both** must be connected:

1. Start **`npm run athena-bridge`** on the Mac.
2. Open **`http://localhost:5173/athena-bridge-dev.html`** (with `npm run dev`) and click **Connect** to `ws://localhost:8765`.
3. On iOS, connect the emitter to **`ws://<Mac-LAN-IP>:8765`** (same relay).

If only the phone is connected, messages are relayed to **zero** peers.

## Xcode integration

1. Drag **`AthenaBridgePacket.swift`** and **`AthenaWebSocketEmitter.swift`** into the app target (check “Copy items if needed”).
2. **iOS 13+** for `URLSessionWebSocketTask`.
3. In the class that receives `IXNMuseDataPacket`, create **`AthenaWebSocketEmitter()`**, call **`connect(url:)`** when you want bridging (e.g. after Muse connects). Use your Mac’s **LAN IP**: `ws://192.168.x.x:8765` while **`npm run athena-bridge`** runs on the Mac.
4. On each **EEG** packet (filter by your `IXNMuseDataPacketType`), call **`emitter.send(...)`** (throttling is built in; tune `minSendInterval` if needed).
5. **Local network:** If the connection fails from device to Mac, add **`NSLocalNetworkUsageDescription`** and **`NSBonjourServices`** only if required by Apple review docs; often a direct TCP `ws://IP:port` works on LAN without Bonjour.

## Wire to your sample

Replace `YOUR_VIEW_CONTROLLER` / listener names in comments with your actual types. The sample’s graph code stays; you only **add** sends alongside existing handlers.

## Reversal

Remove the two Swift files and all `AthenaWebSocketEmitter` references from the Xcode project.

## Wire-up snippet (adapt to your listener)

Add a property: `private let athenaBridge = AthenaWebSocketEmitter()` and call once after Muse connects:

```swift
// Replace host with your Mac's LAN IP (same machine running `npm run athena-bridge`).
if let url = URL(string: "ws://192.168.1.XX:8765") {
    athenaBridge.connect(url: url)
}
```

In your `IXNMuseDataPacket` handler, for **EEG** packets only (match your `IXNMuseDataPacketType`):

```swift
// Pseudocode — use your real packet variable and API names.
let n = 4 // or from packet.valuesSize
var uV: [Double] = []
for i in 0..<n {
    uV.append(packet.getEegChannelValue(i)) // or documented accessor
}
athenaBridge.send(
    td: packet.timestamp(), // match SDK
    tdUnit: "unknown",
    packetTypeRaw: packet.packetType().rawValue,
    packetTypeName: String(describing: packet.packetType()),
    labels: ["TP9", "AF7", "AF8", "TP10"],
    microvolts: uV,
    nominalSampleRateHz: 256, // or nil / your preset
    sampleRateAssumed: true
)
```

Disconnect in your teardown: `athenaBridge.disconnect()`.
