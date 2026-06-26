BrainBit iOS Relay
==================

Native iPad relay for **BrainBit Headphones** via **neurosdk2**.

Streams EEG over the same localhost WebSocket JSON contract the React app consumes through
`brainbit-bridge-eeg-device.ts`:

`ws://127.0.0.1:8765/ws`

Sibling reference (macOS Capsule relay): `native/brainbit-capsule-relay/`

Setup
-----

Install neurosdk2 vendor binaries (once):

```sh
./scripts/setup-neurosdk2-vendor.sh
```

Local test (macOS CLI + Mac Bluetooth)
--------------------------------------

Requires BrainBit Headphones powered on, in range, and worn for contact.

```sh
npm run brainbit-ios-relay:run
```

Or:

```sh
cd native/brainbit-ios-relay
swift run brainbit-ios-relay-cli
```

Automated smoke test (build + connect + validate 3 real EEG frames):

```sh
npm run brainbit-ios-relay:smoke
```

Optional: `BRAINBIT_IOS_RELAY_FRAME_TIMEOUT_MS=180000` for a longer wait.

Validate manually
-----------------

With the relay running and Headphones connected:

```sh
node -e "
const WebSocket=require('ws');
const ws=new WebSocket('ws://127.0.0.1:8765/ws');
ws.on('message',d=>{console.log(JSON.parse(d));process.exit(0);});
"
```

JSON contract
-------------

```json
{
  "type": "eeg",
  "labels": ["A1", "C3", "C4", "A2"],
  "samples": [[...], [...], [...], [...]],
  "sampleCount": 8,
  "channelCount": 4,
  "timestamp": 0
}
```

- `samples[ch][i]` — volts (Ch1=A1, Ch2=C3, Ch3=C4, Ch4=A2 from neurosdk2)
- Validated by `tryParseBrainBitEegJson` in `src/lib/eeg/brainbit-bridge-eeg-device.ts`

Success logs
------------

```
[WS server] listening bind=...
[BrainBitIosRelay] ready — ws://127.0.0.1:8765/ws
[HeadphonesEEG] found device name=... address=...
[HeadphonesEEG] connecting…
[HeadphonesEEG] connection state=0 (inRange)
[HeadphonesEEG] StartSignal — streaming
[HeadphonesEEG] chunk #1 samples=... packNum=... A1=... V
[WS fanout] broadcastJSON #1 ... clientCount=1
```

Integration target
------------------

Linked from the future **Capacitor iOS** app shell. Does not replace desktop Tauri/Capsule.
