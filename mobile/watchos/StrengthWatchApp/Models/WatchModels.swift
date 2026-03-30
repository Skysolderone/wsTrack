import Foundation

enum WatchPayloadType: String, Codable {
  case planSync = "plan_sync"
  case requestPlanSync = "request_plan_sync"
  case setCompleted = "set_completed"
  case workoutResult = "workout_result"
}

struct WatchSetTemplate: Codable, Hashable {
  var setNumber: Int
  var targetWeight: Double?
  var reps: Int?
  var restSeconds: Int
  var isCompleted: Bool
}

struct WatchExercisePlan: Codable, Hashable {
  var exerciseId: String
  var name: String
  var trackingType: String
  var restSeconds: Int
  var sets: [WatchSetTemplate]
}

struct WatchPlanDay: Codable, Hashable {
  var dayId: String
  var exercises: [WatchExercisePlan]
  var name: String
  var planId: String
  var planName: String
}

struct WatchPlanSyncPayload: Codable {
  var generatedAt: TimeInterval
  var type: String
  var version: Int
  var workoutDays: [WatchPlanDay]
}

struct WatchCompletedSetPayload: Codable {
  var completedAt: TimeInterval
  var dayId: String?
  var exerciseId: String
  var exerciseName: String
  var reps: Int?
  var setNumber: Int
  var weight: Double?
}

struct WatchWorkoutCompletionPayload: Codable {
  struct CompletedExercise: Codable {
    var exerciseId: String
    var name: String
    var sets: [WatchSetTemplate]
  }

  var completedAt: TimeInterval
  var dayId: String?
  var exercises: [CompletedExercise]
  var startedAt: TimeInterval
  var workoutName: String
}
