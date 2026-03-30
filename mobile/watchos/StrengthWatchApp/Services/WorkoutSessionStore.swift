import Combine
import Foundation

final class WatchWorkoutSessionStore: ObservableObject {
  static let shared = WatchWorkoutSessionStore()

  @Published private(set) var planDays: [WatchPlanDay] = []
  @Published private(set) var currentDay: WatchPlanDay?
  @Published private(set) var currentExerciseIndex = 0
  @Published private(set) var currentSetIndex = 0
  @Published private(set) var heartRate: Double?
  @Published private(set) var isWorkoutActive = false
  @Published private(set) var restDuration = 0
  @Published private(set) var restRemaining = 0
  @Published private(set) var startedAt: Date?

  private var restTimer: Timer?

  private init() {}

  var currentExercise: WatchExercisePlan? {
    guard
      let currentDay,
      currentDay.exercises.indices.contains(currentExerciseIndex)
    else {
      return nil
    }

    return currentDay.exercises[currentExerciseIndex]
  }

  var currentSet: WatchSetTemplate? {
    guard
      let currentExercise,
      currentExercise.sets.indices.contains(currentSetIndex)
    else {
      return nil
    }

    return currentExercise.sets[currentSetIndex]
  }

  func applyPlanSync(_ payload: WatchPlanSyncPayload) {
    planDays = payload.workoutDays

    if !isWorkoutActive, let currentDay {
      self.currentDay = payload.workoutDays.first(where: { $0.dayId == currentDay.dayId })
    }
  }

  func startWorkout(dayId: String) {
    guard let day = planDays.first(where: { $0.dayId == dayId }) else {
      return
    }

    stopRestTimer()
    currentDay = day
    currentExerciseIndex = 0
    currentSetIndex = 0
    startedAt = Date()
    isWorkoutActive = true
  }

  func adjustCurrentWeight(by delta: Double) {
    guard var day = currentDay else {
      return
    }

    guard day.exercises.indices.contains(currentExerciseIndex) else {
      return
    }

    guard day.exercises[currentExerciseIndex].sets.indices.contains(currentSetIndex) else {
      return
    }

    let currentWeight = day.exercises[currentExerciseIndex].sets[currentSetIndex].targetWeight ?? 0
    let nextWeight = max(0, currentWeight + delta)
    day.exercises[currentExerciseIndex].sets[currentSetIndex].targetWeight = nextWeight
    currentDay = day
  }

  func completeCurrentSet() -> WatchCompletedSetPayload? {
    guard var day = currentDay else {
      return nil
    }

    guard day.exercises.indices.contains(currentExerciseIndex) else {
      return nil
    }

    guard day.exercises[currentExerciseIndex].sets.indices.contains(currentSetIndex) else {
      return nil
    }

    day.exercises[currentExerciseIndex].sets[currentSetIndex].isCompleted = true
    let completedSet = day.exercises[currentExerciseIndex].sets[currentSetIndex]
    let exercise = day.exercises[currentExerciseIndex]
    currentDay = day

    startRest(seconds: completedSet.restSeconds)

    if day.exercises[currentExerciseIndex].sets.indices.contains(currentSetIndex + 1) {
      currentSetIndex += 1
    }

    return WatchCompletedSetPayload(
      completedAt: Date().timeIntervalSince1970,
      dayId: day.dayId,
      exerciseId: exercise.exerciseId,
      exerciseName: exercise.name,
      reps: completedSet.reps,
      setNumber: completedSet.setNumber,
      weight: completedSet.targetWeight
    )
  }

  func moveToNextExercise() {
    guard let day = currentDay else {
      return
    }

    let nextIndex = currentExerciseIndex + 1
    guard day.exercises.indices.contains(nextIndex) else {
      return
    }

    currentExerciseIndex = nextIndex
    currentSetIndex = 0
  }

  func startRest(seconds: Int) {
    restDuration = max(0, seconds)
    restRemaining = max(0, seconds)
    stopRestTimer()

    guard seconds > 0 else {
      return
    }

    restTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] timer in
      guard let self else {
        timer.invalidate()
        return
      }

      if self.restRemaining <= 1 {
        self.restRemaining = 0
        self.stopRestTimer()
      } else {
        self.restRemaining -= 1
      }
    }
  }

  func adjustRest(by seconds: Int) {
    let nextValue = max(0, restRemaining + seconds)
    restRemaining = nextValue
    restDuration = max(restDuration, nextValue)

    if nextValue == 0 {
      stopRestTimer()
    }
  }

  func skipRest() {
    restRemaining = 0
    stopRestTimer()
  }

  func finishWorkout() -> WatchWorkoutCompletionPayload? {
    guard let currentDay, let startedAt else {
      return nil
    }

    let exercises = currentDay.exercises.map { exercise in
      WatchWorkoutCompletionPayload.CompletedExercise(
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        sets: exercise.sets
      )
    }

    let payload = WatchWorkoutCompletionPayload(
      completedAt: Date().timeIntervalSince1970,
      dayId: currentDay.dayId,
      exercises: exercises,
      startedAt: startedAt.timeIntervalSince1970,
      workoutName: currentDay.name
    )

    stopRestTimer()
    self.currentDay = nil
    currentExerciseIndex = 0
    currentSetIndex = 0
    isWorkoutActive = false
    self.startedAt = nil
    restDuration = 0
    restRemaining = 0

    return payload
  }

  func updateHeartRate(_ value: Double?) {
    heartRate = value
  }

  private func stopRestTimer() {
    restTimer?.invalidate()
    restTimer = nil
  }
}
