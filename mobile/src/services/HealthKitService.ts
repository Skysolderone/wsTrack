import { AppState, Platform } from "react-native";
import AppleHealthKit from "react-native-health";

export interface HealthDateRange {
  endDate: Date;
  startDate: Date;
}

export interface HealthBodyWeightSample {
  sourceName?: string;
  startDate: string;
  unit: string;
  value: number;
}

export interface HealthWorkoutInput {
  durationSeconds: number;
  endedAt: number;
  startedAt: number;
  totalVolume: number;
  workoutId: string;
}

type BodyWeightChangeCallback = (samples: HealthBodyWeightSample[]) => void;

const BODY_WEIGHT_POLL_INTERVAL_MS = 60_000;
const DEFAULT_BODY_WEIGHT_KG = 70;

let permissionPromise: Promise<boolean> | null = null;

const healthPermissions = {
  permissions: {
    read: ["Weight"],
    write: ["Workout"],
  },
};

const isHealthKitAvailable = (): boolean => Platform.OS === "ios";

const initHealthKit = async (): Promise<boolean> => {
  if (!isHealthKitAvailable()) {
    return false;
  }

  if (!permissionPromise) {
    permissionPromise = new Promise((resolve) => {
      AppleHealthKit.initHealthKit(healthPermissions, (error) => {
        resolve(!error);
      });
    });
  }

  return permissionPromise;
};

const normalizeDate = (value: Date): string => value.toISOString();

const getLatestBodyWeightKg = async (): Promise<number> => {
  const samples = await readBodyWeight({
    endDate: new Date(),
    startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
  });

  return samples[samples.length - 1]?.value ?? DEFAULT_BODY_WEIGHT_KG;
};

const estimateCalories = async (durationSeconds: number): Promise<number> => {
  const bodyWeightKg = await getLatestBodyWeightKg();
  const durationMinutes = durationSeconds / 60;
  const metValue = 6;
  return Math.max(
    0,
    Math.round((durationMinutes * metValue * 3.5 * bodyWeightKg) / 200),
  );
};

export const requestPermissions = async (): Promise<boolean> => initHealthKit();

export const readBodyWeight = async (
  dateRange: HealthDateRange,
): Promise<HealthBodyWeightSample[]> => {
  const hasPermission = await initHealthKit();
  if (!hasPermission) {
    return [];
  }

  return new Promise((resolve, reject) => {
    AppleHealthKit.getWeightSamples(
      {
        endDate: normalizeDate(dateRange.endDate),
        startDate: normalizeDate(dateRange.startDate),
      },
      (error, samples) => {
        if (error) {
          reject(error);
          return;
        }

        const normalized = (samples ?? [])
          .filter((sample): sample is HealthBodyWeightSample => Boolean(sample))
          .sort(
            (left, right) =>
              new Date(left.startDate).getTime() - new Date(right.startDate).getTime(),
          );

        resolve(normalized);
      },
    );
  });
};

export const writeWorkout = async (workout: HealthWorkoutInput): Promise<void> => {
  const hasPermission = await initHealthKit();
  if (!hasPermission || workout.endedAt <= workout.startedAt) {
    return;
  }

  const calories = await estimateCalories(workout.durationSeconds);

  await new Promise<void>((resolve, reject) => {
    AppleHealthKit.saveWorkout(
      {
        activityType: "TraditionalStrengthTraining",
        endDate: new Date(workout.endedAt).toISOString(),
        energyBurned: calories,
        energyBurnedUnit: "kcal",
        metadata: {
          totalVolume: `${workout.totalVolume}`,
          workoutId: workout.workoutId,
        },
        startDate: new Date(workout.startedAt).toISOString(),
      },
      (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      },
    );
  });
};

export const onBodyWeightChange = (
  callback: BodyWeightChangeCallback,
): (() => void) => {
  if (!isHealthKitAvailable()) {
    return () => undefined;
  }

  let isActive = true;
  let lastFingerprint = "";
  let interval: ReturnType<typeof setInterval> | null = null;

  const emitIfChanged = async (): Promise<void> => {
    const samples = await readBodyWeight({
      endDate: new Date(),
      startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    });

    const latestSample = samples[samples.length - 1];
    const fingerprint = latestSample
      ? `${latestSample.startDate}:${latestSample.value}`
      : "empty";

    if (fingerprint !== lastFingerprint) {
      lastFingerprint = fingerprint;
      callback(samples);
    }
  };

  const startPolling = (): void => {
    if (interval) {
      return;
    }

    void emitIfChanged();
    interval = setInterval(() => {
      if (isActive) {
        void emitIfChanged();
      }
    }, BODY_WEIGHT_POLL_INTERVAL_MS);
  };

  const stopPolling = (): void => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  };

  startPolling();

  const subscription = AppState.addEventListener("change", (state) => {
    isActive = state === "active";
    if (isActive) {
      startPolling();
      void emitIfChanged();
      return;
    }

    stopPolling();
  });

  return () => {
    stopPolling();
    subscription.remove();
  };
};
