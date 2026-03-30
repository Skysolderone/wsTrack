import Combine
import Foundation
import WatchKit

final class WorkoutInterfaceController: WKInterfaceController, WKCrownDelegate {
  @IBOutlet private weak var exerciseLabel: WKInterfaceLabel!
  @IBOutlet private weak var setLabel: WKInterfaceLabel!
  @IBOutlet private weak var weightLabel: WKInterfaceLabel!
  @IBOutlet private weak var repsLabel: WKInterfaceLabel!
  @IBOutlet private weak var heartRateLabel: WKInterfaceLabel!
  @IBOutlet private weak var hintLabel: WKInterfaceLabel!

  private let store = WatchWorkoutSessionStore.shared
  private var cancellables = Set<AnyCancellable>()
  private var crownAccumulator = 0.0

  override func awake(withContext context: Any?) {
    super.awake(withContext: context)
    WatchConnectivityManager.shared.activate(store: store)
    crownSequencer.delegate = self
    crownSequencer.focus()
    clearAllMenuItems()
    addMenuItem(with: .decline, title: "结束训练", action: #selector(finishWorkout))
    bindState()
    HeartRateService.shared.startStreaming()
    refreshUI()
  }

  override func didDeactivate() {
    super.didDeactivate()
    if !store.isWorkoutActive {
      HeartRateService.shared.stopStreaming()
    }
  }

  @IBAction private func didTapScreen() {
    guard let payload = store.completeCurrentSet() else {
      return
    }

    WatchConnectivityManager.shared.sendCompletedSet(payload)

    if store.restRemaining > 0 {
      pushController(withName: "RestTimerHostingController", context: nil)
    }

    refreshUI()
  }

  @IBAction private func didSwipeUpGesture(_ gesture: WKSwipeGestureRecognizer) {
    store.moveToNextExercise()
    refreshUI()
  }

  func crownDidRotate(_ crownSequencer: WKCrownSequencer?, rotationalDelta: Double) {
    crownAccumulator += rotationalDelta

    if abs(crownAccumulator) >= 0.08 {
      let delta = crownAccumulator > 0 ? 2.5 : -2.5
      store.adjustCurrentWeight(by: delta)
      crownAccumulator = 0
      refreshUI()
    }
  }

  func crownDidBecomeIdle(_ crownSequencer: WKCrownSequencer?) {
    crownAccumulator = 0
  }

  @objc private func finishWorkout() {
    guard let payload = store.finishWorkout() else {
      popToRootController()
      return
    }

    WatchConnectivityManager.shared.sendWorkoutCompletion(payload)
    HeartRateService.shared.stopStreaming()
    popToRootController()
  }

  private func bindState() {
    store.$currentDay
      .combineLatest(store.$currentExerciseIndex, store.$currentSetIndex, store.$heartRate)
      .receive(on: DispatchQueue.main)
      .sink { [weak self] _, _, _, _ in
        self?.refreshUI()
      }
      .store(in: &cancellables)
  }

  private func refreshUI() {
    guard let exercise = store.currentExercise, let set = store.currentSet else {
      exerciseLabel.setText("没有可执行的动作")
      setLabel.setText("--")
      weightLabel.setText("--")
      repsLabel.setText("--")
      heartRateLabel.setText("-- bpm")
      hintLabel.setText("从主屏重新同步计划")
      return
    }

    exerciseLabel.setText(exercise.name)
    setLabel.setText("第 \(set.setNumber) 组 / 共 \(exercise.sets.count) 组")
    if let weight = set.targetWeight {
      weightLabel.setText(String(format: "%.1f kg", weight))
    } else {
      weightLabel.setText("-- kg")
    }
    if let reps = set.reps {
      repsLabel.setText("\(reps) 次")
    } else {
      repsLabel.setText("-- 次")
    }
    if let heartRate = store.heartRate {
      heartRateLabel.setText("\(Int(heartRate.rounded())) bpm")
    } else {
      heartRateLabel.setText("-- bpm")
    }
    hintLabel.setText("轻点完成本组，上滑切动作，旋转表冠调重量")
  }
}
