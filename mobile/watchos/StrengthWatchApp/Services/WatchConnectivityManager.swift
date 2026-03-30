import Foundation
import WatchConnectivity

final class WatchConnectivityManager: NSObject, WCSessionDelegate {
  static let shared = WatchConnectivityManager()

  private let session = WCSession.isSupported() ? WCSession.default : nil
  private weak var store: WatchWorkoutSessionStore?

  private override init() {
    super.init()
  }

  func activate(store: WatchWorkoutSessionStore = .shared) {
    self.store = store
    session?.delegate = self
    session?.activate()
  }

  func requestLatestPlanSync() {
    sendDictionary(
      [
        "type": WatchPayloadType.requestPlanSync.rawValue,
        "generatedAt": Date().timeIntervalSince1970,
      ],
      immediate: true
    )
  }

  func sendCompletedSet(_ payload: WatchCompletedSetPayload) {
    sendCodable(payload, type: .setCompleted, immediate: true)
  }

  func sendWorkoutCompletion(_ payload: WatchWorkoutCompletionPayload) {
    sendCodable(payload, type: .workoutResult, immediate: false)
  }

  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    if activationState == .activated {
      requestLatestPlanSync()
    }
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    if session.isReachable {
      requestLatestPlanSync()
    }
  }

  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    handleIncomingPayload(applicationContext)
  }

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
    handleIncomingPayload(userInfo)
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    handleIncomingPayload(message)
  }

  private func handleIncomingPayload(_ payload: [String: Any]) {
    guard let type = payload["type"] as? String else {
      return
    }

    if type == WatchPayloadType.planSync.rawValue,
       let decoded: WatchPlanSyncPayload = decode(WatchPlanSyncPayload.self, from: payload) {
      store?.applyPlanSync(decoded)
    }
  }

  private func sendCodable<T: Codable>(_ payload: T, type: WatchPayloadType, immediate: Bool) {
    let encoder = JSONEncoder()

    guard let data = try? encoder.encode(payload),
          let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      return
    }

    var envelope = object
    envelope["type"] = type.rawValue
    envelope["generatedAt"] = Date().timeIntervalSince1970
    sendDictionary(envelope, immediate: immediate)
  }

  private func sendDictionary(_ payload: [String: Any], immediate: Bool) {
    guard let session else {
      return
    }

    if immediate, session.isReachable {
      session.sendMessage(payload, replyHandler: nil, errorHandler: nil)
      return
    }

    session.transferUserInfo(payload)
  }

  private func decode<T: Decodable>(_ type: T.Type, from dictionary: [String: Any]) -> T? {
    guard JSONSerialization.isValidJSONObject(dictionary) else {
      return nil
    }

    guard let data = try? JSONSerialization.data(withJSONObject: dictionary) else {
      return nil
    }

    return try? JSONDecoder().decode(type, from: data)
  }
}
