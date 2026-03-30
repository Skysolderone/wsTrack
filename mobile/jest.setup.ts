jest.mock("@react-native-async-storage/async-storage", () => {
  const storage = new Map<string, string>();

  return {
    __esModule: true,
    default: {
      clear: jest.fn(async () => {
        storage.clear();
      }),
      getAllKeys: jest.fn(async () => Array.from(storage.keys())),
      getItem: jest.fn(async (key: string) => storage.get(key) ?? null),
      multiGet: jest.fn(async (keys: string[]) =>
        keys.map((key) => [key, storage.get(key) ?? null] as [string, string | null]),
      ),
      multiRemove: jest.fn(async (keys: string[]) => {
        keys.forEach((key) => storage.delete(key));
      }),
      multiSet: jest.fn(async (entries: ReadonlyArray<readonly [string, string]>) => {
        entries.forEach(([key, value]) => {
          storage.set(key, value);
        });
      }),
      removeItem: jest.fn(async (key: string) => {
        storage.delete(key);
      }),
      setItem: jest.fn(async (key: string, value: string) => {
        storage.set(key, value);
      }),
    },
  };
});

jest.mock("react-native-localize", () => ({
  findBestLanguageTag: jest.fn(() => ({
    isRTL: false,
    languageTag: "zh",
  })),
}));

jest.mock("react-native-reanimated", () => {
  return {
    __esModule: true,
    Easing: {
      cubic: "cubic",
      out: (value: unknown) => value,
    },
    default: {
      View: require("react-native").View,
    },
    useAnimatedStyle: (updater: () => Record<string, unknown>) => updater(),
    useSharedValue: <T,>(value: T) => ({ value }),
    withTiming: <T,>(value: T) => value,
  };
});
