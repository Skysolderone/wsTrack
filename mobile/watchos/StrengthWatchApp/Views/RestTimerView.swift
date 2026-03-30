import SwiftUI
import WatchKit

struct RestTimerView: View {
  @Environment(\.dismiss) private var dismiss
  @ObservedObject private var store = WatchWorkoutSessionStore.shared

  private var progress: Double {
    guard store.restDuration > 0 else {
      return 1
    }

    return 1 - (Double(store.restRemaining) / Double(store.restDuration))
  }

  var body: some View {
    VStack(spacing: 10) {
      ZStack {
        Circle()
          .stroke(Color.gray.opacity(0.25), lineWidth: 10)
        Circle()
          .trim(from: 0, to: progress)
          .stroke(Color.green, style: StrokeStyle(lineWidth: 10, lineCap: .round))
          .rotationEffect(.degrees(-90))
        Text("\(store.restRemaining)s")
          .font(.system(size: 24, weight: .bold, design: .rounded))
          .foregroundStyle(.white)
      }
      .frame(width: 108, height: 108)

      HStack(spacing: 8) {
        Button("-15s") {
          store.adjustRest(by: -15)
        }
        Button("+15s") {
          store.adjustRest(by: 15)
        }
      }

      Button("跳过") {
        store.skipRest()
        dismiss()
      }
      .buttonStyle(.borderedProminent)
    }
    .padding()
    .background(Color.black.opacity(0.92))
    .onChange(of: store.restRemaining) { value in
      if value <= 0 {
        WKInterfaceDevice.current().play(.notification)
        dismiss()
      }
    }
  }
}
