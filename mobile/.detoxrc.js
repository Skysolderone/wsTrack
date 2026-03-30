const path = require("path");

const iosBuildDir = path.join("ios", "build");
const iosBinaryPath = path.join(
  iosBuildDir,
  "Build",
  "Products",
  "Release-iphonesimulator",
  "WsTrackMobile.app",
);

module.exports = {
  testRunner: {
    args: {
      config: "e2e/jest.config.js",
    },
    jest: {
      setupTimeout: 180000,
    },
  },
  apps: {
    "ios.sim.release": {
      type: "ios.app",
      binaryPath: iosBinaryPath,
      build:
        "xcodebuild -workspace ios/WsTrackMobile.xcworkspace -scheme WsTrackMobile -configuration Release -sdk iphonesimulator -derivedDataPath ios/build",
    },
    "android.emu.release": {
      type: "android.apk",
      binaryPath: path.join(
        "android",
        "app",
        "build",
        "outputs",
        "apk",
        "release",
        "app-release.apk",
      ),
      testBinaryPath: path.join(
        "android",
        "app",
        "build",
        "outputs",
        "apk",
        "androidTest",
        "release",
        "app-release-androidTest.apk",
      ),
      build:
        "cd android && ./gradlew assembleRelease assembleAndroidTest -DtestBuildType=release",
    },
  },
  devices: {
    "ios.simulator": {
      type: "ios.simulator",
      device: {
        type: "iPhone 15 Pro",
      },
    },
    "android.emulator": {
      type: "android.emulator",
      device: {
        avdName: process.env.DETOX_ANDROID_AVD ?? "Pixel_8_API_34",
      },
    },
  },
  configurations: {
    "ios.sim.release": {
      device: "ios.simulator",
      app: "ios.sim.release",
    },
    "android.emu.release": {
      device: "android.emulator",
      app: "android.emu.release",
    },
  },
};
