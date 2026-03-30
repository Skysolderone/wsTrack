module.exports = {
  preset: "react-native",
  rootDir: ".",
  testMatch: [
    "<rootDir>/src/**/__tests__/**/*.test.ts",
    "<rootDir>/src/**/__tests__/**/*.test.tsx",
  ],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  collectCoverageFrom: [
    "src/utils/calculateVolume.ts",
    "src/utils/convertWeight.ts",
    "src/utils/estimate1RM.ts",
    "src/store/settingsStore.ts",
    "src/store/workoutStore.ts",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transformIgnorePatterns: [
    "node_modules/(?!(react-native|@react-native|@react-native-community|@react-native-async-storage|zustand)/)",
  ],
};
