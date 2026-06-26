// swift-tools-version: 6.0
import PackageDescription
import Foundation

private let packageRoot = URL(fileURLWithPath: #filePath).deletingLastPathComponent().path
private let neurosdkMacLib = "\(packageRoot)/Vendor/macos"
private let neurosdkMacRpathFlags = ["-Xlinker", "-rpath", "-Xlinker", neurosdkMacLib]

let package = Package(
    name: "brainbit-ios-relay",
    platforms: [
        .iOS(.v15),
        .macOS(.v13),
    ],
    products: [
        .library(
            name: "BrainBitIosRelay",
            targets: ["BrainBitIosRelay"]
        ),
        .library(
            name: "Headphones2TruthTestKit",
            targets: ["Headphones2TruthTestKit"]
        ),
        .executable(
            name: "brainbit-ios-relay-cli",
            targets: ["brainbit-ios-relay-cli"]
        ),
        .executable(
            name: "headphones2-truth-test",
            targets: ["headphones2-truth-test"]
        ),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-nio.git", from: "2.83.0"),
    ],
    targets: [
        .binaryTarget(
            name: "neurosdk2",
            path: "Vendor/neurosdk2.xcframework"
        ),
        .target(
            name: "NeuroSdk2Mac",
            path: "Sources/NeuroSdk2Mac",
            publicHeadersPath: "include",
            linkerSettings: [
                .unsafeFlags(["-L\(neurosdkMacLib)", "-lneurosdk2"]),
                .linkedFramework("CoreBluetooth"),
            ]
        ),
        .target(
            name: "BrainBitIosRelay",
            dependencies: [
                .product(name: "NIOCore", package: "swift-nio"),
                .product(name: "NIOHTTP1", package: "swift-nio"),
                .product(name: "NIOPosix", package: "swift-nio"),
                .product(name: "NIOWebSocket", package: "swift-nio"),
                .target(name: "neurosdk2", condition: .when(platforms: [.iOS])),
                .target(name: "NeuroSdk2Mac", condition: .when(platforms: [.macOS])),
            ],
            path: "Sources/BrainBitIosRelay",
            linkerSettings: [
                .linkedFramework("CoreBluetooth", .when(platforms: [.iOS, .macOS])),
            ]
        ),
        .target(
            name: "Headphones2TruthTestKit",
            dependencies: [
                .target(name: "neurosdk2", condition: .when(platforms: [.iOS])),
                .target(name: "NeuroSdk2Mac", condition: .when(platforms: [.macOS])),
            ],
            path: "Sources/Headphones2TruthTestKit",
            linkerSettings: [
                .linkedFramework("CoreBluetooth", .when(platforms: [.iOS, .macOS])),
                .unsafeFlags(neurosdkMacRpathFlags, .when(platforms: [.macOS])),
            ]
        ),
        .executableTarget(
            name: "brainbit-ios-relay-cli",
            dependencies: ["BrainBitIosRelay"],
            path: "Sources/brainbit-ios-relay-cli",
            linkerSettings: [
                .unsafeFlags(neurosdkMacRpathFlags, .when(platforms: [.macOS])),
            ]
        ),
        .executableTarget(
            name: "headphones2-truth-test",
            dependencies: ["Headphones2TruthTestKit"],
            path: "Sources/headphones2-truth-test",
            linkerSettings: [
                .unsafeFlags(neurosdkMacRpathFlags, .when(platforms: [.macOS])),
            ]
        ),
    ]
)
