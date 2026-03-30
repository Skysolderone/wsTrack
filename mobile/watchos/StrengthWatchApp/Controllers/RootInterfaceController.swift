import Combine
import Foundation
import WatchKit

final class RootInterfaceController: WKInterfaceController {
  @IBOutlet private weak var planLabel: WKInterfaceLabel!
  @IBOutlet private weak var dayLabel: WKInterfaceLabel!
  @IBOutlet private weak var statusLabel: WKInterfaceLabel!

  private let store = WatchWorkoutSessionStore.shared
  private var cancellables = Set<AnyCancellable>()

  override func awake(withContext context: Any?) {
    super.awake(withContext: context)
    WatchConnectivityManager.shared.activate(store: store)
    bindState()
    refreshLabels()
  }

  override func willActivate() {
    super.willActivate()
    WatchConnectivityManager.shared.requestLatestPlanSync()
  }

  @IBAction private func didTapStartWorkout() {
    if store.isWorkoutActive {
      pushController(withName: "WorkoutInterfaceController", context: nil)
      return
    }

    guard let dayId = store.planDays.first?.dayId else {
      statusLabel.setText("iPhone 端还没有同步训练日")
      return
    }

    store.startWorkout(dayId: dayId)
    pushController(withName: "WorkoutInterfaceController", context: nil)
  }

  @IBAction private func didTapSync() {
    WatchConnectivityManager.shared.requestLatestPlanSync()
    statusLabel.setText("已请求从 iPhone 同步计划")
  }

  private func bindState() {
    store.$planDays
      .combineLatest(store.$isWorkoutActive)
      .receive(on: DispatchQueue.main)
      .sink { [weak self] _, _ in
        self?.refreshLabels()
      }
      .store(in: &cancellables)
  }

  private func refreshLabels() {
    let firstDay = store.planDays.first
    planLabel.setText(firstDay?.planName ?? "未同步计划")
    dayLabel.setText(firstDay?.name ?? "打开 iPhone App 后点击同步")
    statusLabel.setText(store.isWorkoutActive ? "存在进行中的训练，可直接恢复" : "准备开始训练")
  }
}
