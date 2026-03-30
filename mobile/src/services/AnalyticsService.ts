import { Q } from "@nozbe/watermelondb";

import { database } from "../database";
import type { Workout } from "../models";
import {
  addDays,
  formatDateLabel,
  formatDateTimeLabel,
  startOfDay,
  startOfWeek,
} from "../utils";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export interface WeeklyVolumePoint {
  label: string;
  totalVolume: number;
  weekStart: number;
}

export interface WeeklyVolumeComparison {
  delta: number;
  percentChange: number | null;
  previousWeekVolume: number;
  thisWeekVolume: number;
}

export interface ExerciseHistoryPoint {
  label: string;
  timestamp: number;
  value: number;
  workoutId: string;
}

export interface ExerciseSessionHistoryItem {
  dateLabel: string;
  sets: Array<{
    isPr: boolean;
    isWarmup: boolean;
    reps: number | null;
    rpe: number | null;
    setNumber: number;
    unit: string;
    weight: number | null;
  }>;
  volume: number;
  workoutId: string;
}

interface RawRow extends Record<string, unknown> {}

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

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return toNumber(value);
};

const toString = (value: unknown): string =>
  typeof value === "string" ? value : `${value ?? ""}`;

const toBoolean = (value: unknown): boolean =>
  value === true || value === 1 || value === "1";

const runRawQuery = async (
  sql: string,
  placeholders: unknown[] = [],
): Promise<RawRow[]> =>
  (await database
    .get<Workout>("workouts")
    .query(Q.unsafeSqlQuery(sql, placeholders))
    .unsafeFetchRaw()) as RawRow[];

export const getWeeklyVolume = async (weeksBack: number): Promise<WeeklyVolumePoint[]> => {
  const normalizedWeeks = Math.max(1, Math.round(weeksBack));
  const currentWeekStart = startOfWeek(new Date());
  const earliestWeekStart = addDays(currentWeekStart, -(normalizedWeeks - 1) * 7);
  const nextWeekStart = addDays(currentWeekStart, 7);

  const rows = await runRawQuery(
    `
      select
        cast((started_at - ?) / ? as integer) as week_index,
        sum(total_volume) as total_volume
      from workouts
      where _status is not 'deleted'
        and finished_at is not null
        and started_at >= ?
        and started_at < ?
      group by week_index
      order by week_index asc
    `,
    [earliestWeekStart.getTime(), WEEK_MS, earliestWeekStart.getTime(), nextWeekStart.getTime()],
  );

  const lookup = new Map(
    rows.map((row) => [toNumber(row.week_index), toNumber(row.total_volume)]),
  );

  return Array.from({ length: normalizedWeeks }, (_, index) => {
    const weekStart = addDays(earliestWeekStart, index * 7);
    return {
      label: formatDateLabel(weekStart.getTime()),
      totalVolume: lookup.get(index) ?? 0,
      weekStart: weekStart.getTime(),
    };
  });
};

export const getWeeklyWorkoutCount = async (): Promise<number> => {
  const currentWeekStart = startOfWeek(new Date());
  const nextWeekStart = addDays(currentWeekStart, 7);
  const rows = await runRawQuery(
    `
      select count(*) as count
      from workouts
      where _status is not 'deleted'
        and finished_at is not null
        and started_at >= ?
        and started_at < ?
    `,
    [currentWeekStart.getTime(), nextWeekStart.getTime()],
  );

  return toNumber(rows[0]?.count);
};

export const getWeeklyVolumeComparison = async (): Promise<WeeklyVolumeComparison> => {
  const currentWeekStart = startOfWeek(new Date());
  const previousWeekStart = addDays(currentWeekStart, -7);
  const nextWeekStart = addDays(currentWeekStart, 7);

  const rows = await runRawQuery(
    `
      select
        sum(case
          when started_at >= ? and started_at < ? then total_volume
          else 0
        end) as this_week_volume,
        sum(case
          when started_at >= ? and started_at < ? then total_volume
          else 0
        end) as previous_week_volume
      from workouts
      where _status is not 'deleted'
        and finished_at is not null
        and started_at >= ?
        and started_at < ?
    `,
    [
      currentWeekStart.getTime(),
      nextWeekStart.getTime(),
      previousWeekStart.getTime(),
      currentWeekStart.getTime(),
      previousWeekStart.getTime(),
      nextWeekStart.getTime(),
    ],
  );

  const thisWeekVolume = toNumber(rows[0]?.this_week_volume);
  const previousWeekVolume = toNumber(rows[0]?.previous_week_volume);
  const delta = Number((thisWeekVolume - previousWeekVolume).toFixed(2));
  const percentChange =
    previousWeekVolume > 0
      ? Number(((delta / previousWeekVolume) * 100).toFixed(1))
      : null;

  return {
    delta,
    percentChange,
    previousWeekVolume,
    thisWeekVolume,
  };
};

export const getStreak = async (): Promise<number> => {
  const rows = await runRawQuery(
    `
      select distinct strftime('%Y-%m-%d', started_at / 1000, 'unixepoch', 'localtime') as training_day
      from workouts
      where _status is not 'deleted'
        and finished_at is not null
      order by training_day desc
      limit 120
    `,
  );

  const dayKeys = rows.map((row) => toString(row.training_day)).filter(Boolean);
  if (dayKeys.length === 0) {
    return 0;
  }

  const today = startOfDay(new Date());
  const yesterday = addDays(today, -1);
  const startCandidates = [today, yesterday].map((date) => date.toISOString().slice(0, 10));
  const firstDay = dayKeys[0];

  if (!firstDay || !startCandidates.includes(firstDay)) {
    return 0;
  }

  let streak = 0;
  let cursor = new Date(`${firstDay}T00:00:00`);

  for (const dayKey of dayKeys) {
    if (dayKey !== cursor.toISOString().slice(0, 10)) {
      break;
    }

    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
};

export const getExerciseVolumeHistory = async (
  exerciseId: string,
  limit: number,
): Promise<ExerciseHistoryPoint[]> => {
  const normalizedLimit = Math.max(1, Math.round(limit));
  const rows = await runRawQuery(
    `
      select
        workouts.id as workout_id,
        workouts.started_at as started_at,
        workout_exercises.volume as volume
      from workout_exercises
      inner join workouts on workouts.id = workout_exercises.workout_id
      where workout_exercises._status is not 'deleted'
        and workouts._status is not 'deleted'
        and workouts.finished_at is not null
        and workout_exercises.exercise_id = ?
      order by workouts.started_at desc
      limit ?
    `,
    [exerciseId, normalizedLimit],
  );

  return rows
    .map((row) => ({
      label: formatDateLabel(toNumber(row.started_at)),
      timestamp: toNumber(row.started_at),
      value: toNumber(row.volume),
      workoutId: toString(row.workout_id),
    }))
    .reverse();
};

export const getExerciseMaxWeightHistory = async (
  exerciseId: string,
  limit: number,
): Promise<ExerciseHistoryPoint[]> => {
  const normalizedLimit = Math.max(1, Math.round(limit));
  const rows = await runRawQuery(
    `
      select
        workouts.id as workout_id,
        workouts.started_at as started_at,
        max(coalesce(workout_sets.weight, 0)) as max_weight
      from workout_sets
      inner join workout_exercises on workout_exercises.id = workout_sets.workout_exercise_id
      inner join workouts on workouts.id = workout_exercises.workout_id
      where workout_sets._status is not 'deleted'
        and workout_exercises._status is not 'deleted'
        and workouts._status is not 'deleted'
        and workouts.finished_at is not null
        and workout_exercises.exercise_id = ?
        and workout_sets.is_completed = 1
      group by workouts.id, workouts.started_at
      order by workouts.started_at desc
      limit ?
    `,
    [exerciseId, normalizedLimit],
  );

  return rows
    .map((row) => ({
      label: formatDateLabel(toNumber(row.started_at)),
      timestamp: toNumber(row.started_at),
      value: toNumber(row.max_weight),
      workoutId: toString(row.workout_id),
    }))
    .reverse();
};

export const getExerciseSessionHistory = async (
  exerciseId: string,
  limit: number,
): Promise<ExerciseSessionHistoryItem[]> => {
  const normalizedLimit = Math.max(1, Math.round(limit));
  const workouts = await runRawQuery(
    `
      select
        workouts.id as workout_id,
        workouts.started_at as started_at,
        workout_exercises.volume as volume
      from workout_exercises
      inner join workouts on workouts.id = workout_exercises.workout_id
      where workout_exercises._status is not 'deleted'
        and workouts._status is not 'deleted'
        and workouts.finished_at is not null
        and workout_exercises.exercise_id = ?
      order by workouts.started_at desc
      limit ?
    `,
    [exerciseId, normalizedLimit],
  );

  if (workouts.length === 0) {
    return [];
  }

  const workoutIds = workouts.map((row) => toString(row.workout_id));
  const placeholders = workoutIds.map(() => "?").join(", ");
  const setRows = await runRawQuery(
    `
      select
        workouts.id as workout_id,
        workout_sets.set_number as set_number,
        workout_sets.weight as weight,
        workout_sets.reps as reps,
        workout_sets.rpe as rpe,
        workout_sets.is_warmup as is_warmup,
        workout_sets.is_pr as is_pr,
        workout_sets.unit as unit
      from workout_sets
      inner join workout_exercises on workout_exercises.id = workout_sets.workout_exercise_id
      inner join workouts on workouts.id = workout_exercises.workout_id
      where workout_sets._status is not 'deleted'
        and workout_exercises._status is not 'deleted'
        and workouts._status is not 'deleted'
        and workout_exercises.exercise_id = ?
        and workouts.id in (${placeholders})
      order by workouts.started_at desc, workout_sets.set_number asc
    `,
    [exerciseId, ...workoutIds],
  );

  const groupedSets = new Map<string, ExerciseSessionHistoryItem["sets"]>();
  for (const row of setRows) {
    const workoutId = toString(row.workout_id);
    const list = groupedSets.get(workoutId) ?? [];
    list.push({
      isPr: toBoolean(row.is_pr),
      isWarmup: toBoolean(row.is_warmup),
      reps: toNullableNumber(row.reps),
      rpe: toNullableNumber(row.rpe),
      setNumber: toNumber(row.set_number),
      unit: toString(row.unit),
      weight: toNullableNumber(row.weight),
    });
    groupedSets.set(workoutId, list);
  }

  return workouts.map((row) => {
    const workoutId = toString(row.workout_id);
    return {
      dateLabel: formatDateTimeLabel(toNumber(row.started_at)),
      sets: groupedSets.get(workoutId) ?? [],
      volume: toNumber(row.volume),
      workoutId,
    };
  });
};
