BrainBit iPad (Capacitor shell)
===============================

Capacitor iOS wrapper for the BrainBit MVP flow (`AppBrainBitMvp`).

Architecture
------------

```
Capacitor iOS app (ios/)
  ├─ BrainBitIosRelay (local Swift package) — auto-starts on launch
  └─ WKWebView → Vite build (dist/) with brainbit-ipad env mode
       └─ ws://127.0.0.1:8765/ws
```

Prerequisites
-------------

1. Xcode 15+ with iOS 15+ deployment target
2. neurosdk2 vendor libs (once per machine):

```sh
npm run setup-neurosdk2-vendor
```

Build and run on iPad
---------------------

From repo root:

```sh
npm run cap:sync:ios
npm run cap:open:ios
```

In Xcode:

1. Open **App.xcworkspace** (not `.xcodeproj`)
2. Select your physical iPad as the run destination
3. Set signing team under **App → Signing & Capabilities**
4. Run (⌘R)

No Mac CLI relay is required — the native relay starts in `AppDelegate` on launch.

Success criteria
----------------

- App opens to the BrainBit MVP Setup screen
- Xcode console shows `[App] BrainBit relay started` and `ws://127.0.0.1:8765/ws`
- iOS prompts for Bluetooth permission on first launch
- **Connect BrainBit** finds Headphones, shows live contact quality, session runs, Done → Start again

Browser dev (Mac, optional)
-----------------------------

For iterating on the web UI without rebuilding the iOS app:

```sh
npm run brainbit-ios-relay:run   # terminal 1
# terminal 2: .env.local with MVP flags, then npm run dev
```
