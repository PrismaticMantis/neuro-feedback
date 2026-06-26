NeuroSDK2 vendor files (not committed)
=======================================

Run from repo root:

```sh
./scripts/setup-neurosdk2-vendor.sh
```

This copies from [BrainbitLLC/apple_neurosdk2](https://github.com/BrainbitLLC/apple_neurosdk2):

- `Vendor/neurosdk2.xcframework` — iOS / simulator
- `Vendor/macos/` — macOS dylib + headers (CLI dev on Mac)

Required before building the relay with real device support.
