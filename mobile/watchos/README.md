# watchOS source structure

This folder is a standalone watchOS source layout intended to be moved into a future iOS native shell under `mobile/ios/`.

Current workspace does not contain an Xcode iOS project or a watchOS target, so this code is delivered as source-only structure:

- `StrengthWatchApp/Controllers/RootInterfaceController.swift`
  - watch entry controller
  - requests the latest plan payload from iPhone
  - starts or resumes a workout
- `StrengthWatchApp/Controllers/WorkoutInterfaceController.swift`
  - active workout screen
  - Digital Crown adjusts weight in 2.5 increments
  - tap completes current set
  - swipe up moves to next exercise
  - long-press menu item ends the workout
- `StrengthWatchApp/Controllers/RestTimerHostingController.swift`
  - hosts the SwiftUI rest timer page
- `StrengthWatchApp/Views/RestTimerView.swift`
  - circular countdown + haptic completion
- `StrengthWatchApp/Services/WatchConnectivityManager.swift`
  - iPhone <-> Watch payload transport
- `StrengthWatchApp/Services/HeartRateService.swift`
  - live heart rate streaming through HealthKit
- `StrengthWatchApp/Services/WorkoutSessionStore.swift`
  - in-memory watch workout session state
- `StrengthWatchApp/Models/WatchModels.swift`
  - shared payload models matching `mobile/src/services/WatchSyncPayloadService.ts`

To wire this into Xcode later:

1. Create a watchOS App + Extension target in the iOS shell.
2. Add storyboard scenes named:
   - `RootInterfaceController`
   - `WorkoutInterfaceController`
   - `RestTimerHostingController`
3. Connect outlets/actions declared in the controller files.
4. Enable HealthKit + WatchConnectivity capabilities for both iPhone and watch targets.
5. Mirror the payload contract from `mobile/src/services/WatchSyncPayloadService.ts` on the iPhone native bridge.
