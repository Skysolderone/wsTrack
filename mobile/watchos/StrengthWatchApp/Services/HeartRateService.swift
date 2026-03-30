import Foundation
import HealthKit

final class HeartRateService: NSObject, HKWorkoutSessionDelegate, HKLiveWorkoutBuilderDelegate {
  static let shared = HeartRateService()

  private let healthStore = HKHealthStore()
  private var workoutSession: HKWorkoutSession?
  private var workoutBuilder: HKLiveWorkoutBuilder?

  func requestPermissions(completion: @escaping (Bool) -> Void) {
    guard HKHealthStore.isHealthDataAvailable(),
          let heartRateType = HKObjectType.quantityType(forIdentifier: .heartRate) else {
      completion(false)
      return
    }

    healthStore.requestAuthorization(toShare: [], read: [heartRateType]) { success, _ in
      completion(success)
    }
  }

  func startStreaming() {
    guard workoutSession == nil else {
      return
    }

    let configuration = HKWorkoutConfiguration()
    configuration.activityType = .traditionalStrengthTraining
    configuration.locationType = .indoor

    do {
      let session = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
      let builder = session.associatedWorkoutBuilder()
      builder.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: configuration)
      session.delegate = self
      builder.delegate = self

      workoutSession = session
      workoutBuilder = builder

      let startDate = Date()
      session.startActivity(with: startDate)
      builder.beginCollection(withStart: startDate) { _, _ in }
    } catch {
      WatchWorkoutSessionStore.shared.updateHeartRate(nil)
    }
  }

  func stopStreaming() {
    workoutSession?.end()
    workoutBuilder?.endCollection(withEnd: Date()) { _, _ in }
    workoutBuilder?.finishWorkout { _, _ in }
    workoutSession = nil
    workoutBuilder = nil
  }

  func workoutSession(
    _ workoutSession: HKWorkoutSession,
    didChangeTo toState: HKWorkoutSessionState,
    from fromState: HKWorkoutSessionState,
    date: Date
  ) {}

  func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
    WatchWorkoutSessionStore.shared.updateHeartRate(nil)
  }

  func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

  func workoutBuilder(
    _ workoutBuilder: HKLiveWorkoutBuilder,
    didCollectDataOf collectedTypes: Set<HKSampleType>
  ) {
    guard let heartRateType = HKObjectType.quantityType(forIdentifier: .heartRate),
          collectedTypes.contains(heartRateType),
          let statistics = workoutBuilder.statistics(for: heartRateType) else {
      return
    }

    let unit = HKUnit.count().unitDivided(by: .minute())
    let rate = statistics.mostRecentQuantity()?.doubleValue(for: unit)
    WatchWorkoutSessionStore.shared.updateHeartRate(rate)
  }
}
