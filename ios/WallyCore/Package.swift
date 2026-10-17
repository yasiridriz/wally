// swift-tools-version: 5.9
import PackageDescription

// Platform-independent Wally logic. `swift test` runs it on macOS without a simulator.
let package = Package(
  name: "WallyCore",
  platforms: [.iOS(.v17), .macOS(.v14)],
  products: [.library(name: "WallyCore", targets: ["WallyCore"])],
  targets: [
    .target(name: "WallyCore"),
    .testTarget(name: "WallyCoreTests", dependencies: ["WallyCore"]),
  ]
)
