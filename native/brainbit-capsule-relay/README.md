BrainBit Capsule Relay
======================

This Swift package builds the BrainBit Capsule WebSocket relay used by the web app at:

`ws://127.0.0.1:8765/ws`

The relay is intended to become a desktop-app sidecar. It should not depend on user-specific absolute paths.

Capsule SDK Layout
------------------

The package expects the BrainBit Capsule macOS SDK root to contain:

- `Include/Capsule/*.h`
- `libCapsuleClient.dylib`

By default, the package looks for:

`native/brainbit-capsule-relay/Vendor/CapsuleSDK/Mac`

For local development, you can either copy the SDK Mac folder there, or point the build at an external SDK:

```sh
BRAINBIT_CAPSULE_SDK_ROOT="/path/to/capsule-public-v1.5.0/CapsuleAPI/Mac" swift build
```

The currently tested Capsule dylib is `x86_64` only. On Apple Silicon, build the relay for `x86_64`
unless you have an arm64/universal Capsule SDK:

```sh
BRAINBIT_CAPSULE_SDK_ROOT="/path/to/capsule-public-v1.5.0/CapsuleAPI/Mac" swift build --arch x86_64
```

Runtime Dylib Discovery
-----------------------

The executable links `libCapsuleClient.dylib` via `@executable_path` and `@executable_path/../Frameworks`.

For sidecar packaging, copy `libCapsuleClient.dylib` either:

- next to the `brainbit-capsule-relay` executable, or
- into the desktop app's `Frameworks` directory if the sidecar lives in a `MacOS`-style app bundle layout.

Local build outputs under `.build/...` do not automatically contain the dylib. For local smoke tests, copy the dylib next to the built executable or run with `DYLD_LIBRARY_PATH` pointing to the SDK Mac folder.

Local smoke test:

```sh
DYLD_LIBRARY_PATH="/path/to/capsule-public-v1.5.0/CapsuleAPI/Mac" .build/x86_64-apple-macosx/debug/brainbit-capsule-relay
```
