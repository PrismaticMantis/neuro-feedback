import Headphones2TruthTestKit
import SwiftUI

@main
struct Headphones2TruthTestHostApp: App {
    @State private var started = false

    var body: some Scene {
        WindowGroup {
            VStack(spacing: 12) {
                Text("Headphones2 Truth Test")
                    .font(.headline)
                Text("Running — watch the Xcode console for [TruthTest] lines.")
                    .font(.subheadline)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
            }
            .padding()
            .onAppear {
                guard !started else { return }
                started = true
                Headphones2TruthTest.run()
            }
        }
    }
}
