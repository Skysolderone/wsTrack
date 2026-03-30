const path = require("path");

module.exports = {
  rootDir: path.resolve(__dirname, ".."),
  testEnvironment: "detox/runners/jest/testEnvironment",
  testMatch: ["<rootDir>/e2e/**/*.test.ts"],
  setupFilesAfterEnv: ["<rootDir>/e2e/init.ts"],
  reporters: ["detox/runners/jest/reporter"],
  transform: {
    "^.+\\.(ts|tsx)$": [
      "babel-jest",
      {
        configFile: path.resolve(__dirname, "../babel.config.js"),
      },
    ],
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  maxWorkers: 1,
  testTimeout: 180000,
  verbose: true,
};
