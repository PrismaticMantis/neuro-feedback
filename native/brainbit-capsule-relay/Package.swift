// swift-tools-version: 6.3
import PackageDescription
import Foundation

private let packageRoot = URL(fileURLWithPath: #filePath).deletingLastPathComponent().path

private func packageRelativePath(_ path: String) -> String {
    if path.hasPrefix("/") {
        return path
    }
    return "\(packageRoot)/\(path)"
}

/// Capsule SDK Mac root. Expected layout:
/// - Include/Capsule/*.h
/// - libCapsuleClient.dylib
///
/// For sidecar bundling, copy the SDK Mac folder to:
///   native/brainbit-capsule-relay/Vendor/CapsuleSDK/Mac
/// or set BRAINBIT_CAPSULE_SDK_ROOT to the SDK Mac folder.
private let capsuleSdkRoot = packageRelativePath(
    Context.environment["BRAINBIT_CAPSULE_SDK_ROOT"] ?? "Vendor/CapsuleSDK/Mac"
)

private let capsuleMacInclude = "\(capsuleSdkRoot)/Include"
private let capsuleMacLib = capsuleSdkRoot

let package = Package(
    name: "brainbit-capsule-relay",
    platforms: [.macOS(.v13)],
    products: [
        .executable(
            name: "brainbit-capsule-relay",
            targets: ["brainbit-capsule-relay"]
        )
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-nio.git", from: "2.83.0"),
    ],
    targets: [
        .target(
            name: "CapsuleBridge",
            path: "Sources/CapsuleBridge",
            publicHeadersPath: "include",
            cSettings: [
                .unsafeFlags(["-I", capsuleMacInclude])
            ],
            cxxSettings: [
                .unsafeFlags(["-I", capsuleMacInclude])
            ],
            linkerSettings: [
                .unsafeFlags([
                    "-L\(capsuleMacLib)",
                    "-lCapsuleClient",
                    "-Xlinker", "-rpath",
                    "-Xlinker", "@executable_path",
                    "-Xlinker", "-rpath",
                    "-Xlinker", "@executable_path/../Frameworks"
                ])
            ]
        ),
        .executableTarget(
            name: "brainbit-capsule-relay",
            dependencies: [
                "CapsuleBridge",
                .product(name: "NIOCore", package: "swift-nio"),
                .product(name: "NIOPosix", package: "swift-nio"),
                .product(name: "NIOHTTP1", package: "swift-nio"),
                .product(name: "NIOWebSocket", package: "swift-nio"),
            ],
            swiftSettings: [
                // Clang importer needs the same include root when parsing CapsuleBridge for Swift.
                .unsafeFlags(["-Xcc", "-I\(capsuleMacInclude)"], .when(platforms: [.macOS]))
            ]
        ),
        .testTarget(
            name: "brainbit-capsule-relayTests",
            dependencies: ["brainbit-capsule-relay"]
        ),
    ],
    swiftLanguageModes: [.v6]
)
