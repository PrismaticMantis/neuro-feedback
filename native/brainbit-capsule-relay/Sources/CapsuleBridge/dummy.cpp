// Minimal translation unit so SwiftPM applies CapsuleBridge c/cxxSettings (headers-only
// targets never invoke clang, so -I for Platforms.hpp was ignored).
// Include only CClient.h — not the full capsule_bridge.h umbrella — to avoid unrelated
// vendored header order issues (e.g. CPPG types) while still pulling SDK Platforms.hpp
// via CDefinesPrivate.h.
#include "Capsule/CClient.h"

namespace {
void _capsule_bridge_force_link_capsule_headers() {}
}
