import { Q } from "@nozbe/watermelondb";

import { MuscleGroup } from "../constants/enums";
import { database } from "../database";
import type { Workout } from "../models";

export interface MuscleVolumePoint {
  muscle: MuscleGroup;
  ratio: number;
  totalVolume: number;
}

export interface MuscleFrequencyPoint {
  lastTrainedAt: number | null;
  muscle: MuscleGroup;
  sessions: number;
}

interface RawRow extends Record<string, unknown> {}

interface MuscleContribution {
  muscle: MuscleGroup;
  share: number;
}

const trackedMuscles = Object.values(MuscleGroup).filter(
  (muscle): muscle is MuscleGroup => muscle !== MuscleGroup.FullBody,
);

const toNumber = (value: unknown): number => {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

const toString = (value: unknown): string =>
  typeof value === "string" ? value : `${value ?? ""}`;

const parseMuscles = (raw: unknown): MuscleGroup[] => {
  if (typeof raw !== "string" || raw.length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((value): value is MuscleGroup =>
      trackedMuscles.includes(value as MuscleGroup),
    );
  } catch {
    return [];
  }
};

const buildDateCondition = (dateRange: number | null): {
  placeholders: unknown[];
  whereClause: string;
} => {
  if (dateRange === null) {
    return {
      placeholders: [],
      whereClause: "",
    };
  }

  return {
    placeholders: [Date.now() - dateRange * 24 * 60 * 60 * 1000],
    whereClause: "and workouts.started_at >= ?",
  };
};

const runRawQuery = async (
  sql: string,
  placeholders: unknown[] = [],
): Promise<RawRow[]> =>
  (await database
    .get<Workout>("workouts")
    .query(Q.unsafeSqlQuery(sql, placeholders))
    .unsafeFetchRaw()) as RawRow[];

const buildMuscleContributions = (
  primaryMuscles: MuscleGroup[],
  secondaryMuscles: MuscleGroup[],
): MuscleContribution[] => {
  const weights = new Map<MuscleGroup, number>();

  for (const muscle of primaryMuscles) {
    weights.set(muscle, (weights.get(muscle) ?? 0) + 1);
  }

  for (const muscle of secondaryMuscles) {
    weights.set(muscle, (weights.get(muscle) ?? 0) + 0.5);
  }

  const totalWeight = Array.from(weights.values()).reduce((sum, value) => sum + value, 0);
  if (totalWeight <= 0) {
    return [];
  }

  return Array.from(weights.entries()).map(([muscle, weight]) => ({
    muscle,
    share: weight / totalWeight,
  }));
};

const createVolumeMap = (): Map<MuscleGroup, number> =>
  new Map(trackedMuscles.map((muscle) => [muscle, 0]));

const createFrequencyMap = (): Map<MuscleGroup, Set<string>> =>
  new Map(trackedMuscles.map((muscle) => [muscle, new Set<string>()]));

const createLastTrainedMap = (): Map<MuscleGroup, number | null> =>
  new Map(trackedMuscles.map((muscle) => [muscle, null]));

const loadMuscleRows = async (dateRange: number | null): Promise<RawRow[]> => {
  const { placeholders, whereClause } = buildDateCondition(dateRange);

  return runRawQuery(
    `
      select
        workout_exercises.volume as volume,
        workouts.id as workout_id,
        workouts.started_at as started_at,
        exercises.primary_muscles as primary_muscles,
        exercises.secondary_muscles as secondary_muscles
      from workout_exercises
      inner join workouts on workouts.id = workout_exercises.workout_id
      inner join exercises on exercises.id = workout_exercises.exercise_id
      where workout_exercises._status is not 'deleted'
        and workouts._status is not 'deleted'
        and exercises._status is not 'deleted'
        and workouts.finished_at is not null
        ${whereClause}
    `,
    placeholders,
  );
};

export const getMuscleVolumeDistribution = async (
  dateRange: number | null,
): Promise<MuscleVolumePoint[]> => {
  const rows = await loadMuscleRows(dateRange);
  const volumeByMuscle = createVolumeMap();

  for (const row of rows) {
    const volume = toNumber(row.volume);
    const contributions = buildMuscleContributions(
      parseMuscles(row.primary_muscles),
      parseMuscles(row.secondary_muscles),
    );

    for (const contribution of contributions) {
      volumeByMuscle.set(
        contribution.muscle,
        (volumeByMuscle.get(contribution.muscle) ?? 0) + volume * contribution.share,
      );
    }
  }

  const totalVolume = Array.from(volumeByMuscle.values()).reduce((sum, value) => sum + value, 0);

  return trackedMuscles.map((muscle) => {
    const muscleVolume = Number((volumeByMuscle.get(muscle) ?? 0).toFixed(2));

    return {
      muscle,
      ratio: totalVolume > 0 ? Number((muscleVolume / totalVolume).toFixed(4)) : 0,
      totalVolume: muscleVolume,
    };
  });
};

export const getMuscleFrequency = async (
  dateRange: number | null,
): Promise<MuscleFrequencyPoint[]> => {
  const rows = await loadMuscleRows(dateRange);
  const frequencyMap = createFrequencyMap();
  const lastTrainedMap = createLastTrainedMap();

  for (const row of rows) {
    const workoutId = toString(row.workout_id);
    const startedAt = toNumber(row.started_at);
    const contributions = buildMuscleContributions(
      parseMuscles(row.primary_muscles),
      parseMuscles(row.secondary_muscles),
    );

    for (const contribution of contributions) {
      frequencyMap.get(contribution.muscle)?.add(workoutId);
      const previous = lastTrainedMap.get(contribution.muscle);
      if (previous === null || startedAt > previous) {
        lastTrainedMap.set(contribution.muscle, startedAt);
      }
    }
  }

  return trackedMuscles.map((muscle) => ({
    lastTrainedAt: lastTrainedMap.get(muscle) ?? null,
    muscle,
    sessions: frequencyMap.get(muscle)?.size ?? 0,
  }));
};

export const getUntrainedMuscles = async (days: number): Promise<MuscleGroup[]> => {
  const frequency = await getMuscleFrequency(null);
  const threshold = Date.now() - Math.max(1, Math.round(days)) * 24 * 60 * 60 * 1000;

  return frequency
    .filter((item) => item.lastTrainedAt === null || item.lastTrainedAt < threshold)
    .map((item) => item.muscle);
};
