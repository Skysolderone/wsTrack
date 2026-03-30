import Foundation
import HealthKit
import WatchKit

final class ExtensionDelegate: NSObject, WKExtensionDelegate {
  func applicationDidFinishLaunching() {
    WatchConnectivityManager.shared.activate()
    HeartRateService.shared.requestPermissions { _ in }
  }
}
