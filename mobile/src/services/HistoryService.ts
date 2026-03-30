import { Q } from "@nozbe/watermelondb";

import { database } from "../database";
import type { Workout } from "../models";
import { formatDateTimeLabel } from "../utils";

export interface HistoryFilters {
  dateRangeDays: number | null;
  searchQuery: string;
}

export interface HistoryWorkoutListItem {
  dateLabel: string;
  durationSeconds: number;
  exerciseCount: number;
  startedAt: number;
  title: string;
  totalVolume: number;
  workoutId: string;
}

export interface WorkoutHistoryPage {
  hasMore: boolean;
  items: HistoryWorkoutListItem[];
}

export interface WorkoutDetailData {
  dateLabel: string;
  durationSeconds: number;
  exerciseCount: number;
  exercises: WorkoutDetailExercise[];
  notes: string;
  rating: number | null;
  title: string;
  totalSets: number;
  totalVolume: number;
  workoutId: string;
}

export interface WorkoutDetailExercise {
  exerciseId: string;
  name: string;
  sets: WorkoutDetailSet[];
  volume: number;
  workoutExerciseId: string;
}

export interface WorkoutDetailSet {
  isCompleted: boolean;
  isPr: boolean;
  isWarmup: boolean;
  reps: number | null;
  restSeconds: number | null;
  rpe: number | null;
  setNumber: number;
  unit: string;
  weight: number | null;
  workoutSetId: string;
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

const toNullableString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const toString = (value: unknown): string =>
  typeof value === "string" ? value : `${value ?? ""}`;

const toBoolean = (value: unknown): boolean =>
  value === true || value === 1 || value === "1";

const PAGE_PADDING = 1;

const buildSearchPattern = (query: string): string => {
  const sanitized = Q.sanitizeLikeString(query.trim());
  return `%${sanitized}%`;
};

const buildDateRange = (dateRangeDays: number | null): {
  endAt: number;
  startAt: number;
} => ({
  endAt: Date.now() + 1,
  startAt:
    dateRangeDays === null
      ? 0
      : Date.now() - dateRangeDays * 24 * 60 * 60 * 1000,
});

const runRawQuery = async (
  sql: string,
  placeholders: unknown[] = [],
): Promise<RawRow[]> =>
  (await database
    .get<Workout>("workouts")
    .query(Q.unsafeSqlQuery(sql, placeholders))
    .unsafeFetchRaw()) as RawRow[];

const mapHistoryRow = (row: RawRow): HistoryWorkoutListItem => ({
  dateLabel: formatDateTimeLabel(toNumber(row.started_at)),
  durationSeconds: toNumber(row.duration_seconds),
  exerciseCount: toNumber(row.exercise_count),
  startedAt: toNumber(row.started_at),
  title: toNullableString(row.plan_day_name) ?? "自由训练",
  totalVolume: toNumber(row.total_volume),
  workoutId: toString(row.workout_id),
});

const historyQuery = `
  select
    workouts.id as workout_id,
    workouts.started_at as started_at,
    workouts.duration_seconds as duration_seconds,
    workouts.total_volume as total_volume,
    count(distinct workout_exercises.id) as exercise_count,
    plan_days.name as plan_day_name
  from workouts
  left join plan_days on plan_days.id = workouts.plan_day_id and plan_days._status is not 'deleted'
  left join workout_exercises on workout_exercises.workout_id = workouts.id and workout_exercises._status is not 'deleted'
  where workouts._status is not 'deleted'
    and workouts.finished_at is not null
    and workouts.started_at >= ?
    and workouts.started_at < ?
    and (
      ? = ''
      or exists (
        select 1
        from workout_exercises as search_we
        inner join exercises as search_ex on search_ex.id = search_we.exercise_id
        where search_we.workout_id = workouts.id
          and search_we._status is not 'deleted'
          and search_ex._status is not 'deleted'
          and (
            search_ex.name like ?
            or ifnull(search_ex.name_en, '') like ?
          )
      )
    )
  group by workouts.id, workouts.started_at, workouts.duration_seconds, workouts.total_volume, plan_days.name
`;

export const loadWorkoutHistoryPage = async (input: {
  filters: HistoryFilters;
  limit: number;
  offset: number;
}): Promise<WorkoutHistoryPage> => {
  const { endAt, startAt } = buildDateRange(input.filters.dateRangeDays);
  const searchQuery = input.filters.searchQuery.trim();
  const searchPattern = buildSearchPattern(searchQuery);
  const rows = await runRawQuery(
    `
      ${historyQuery}
      order by workouts.started_at desc
      limit ?
      offset ?
    `,
    [
      startAt,
      endAt,
      searchQuery,
      searchPattern,
      searchPattern,
      input.limit + PAGE_PADDING,
      input.offset,
    ],
  );

  return {
    hasMore: rows.length > input.limit,
    items: rows.slice(0, input.limit).map(mapHistoryRow),
  };
};

export const loadCalendarMonthSessions = async (input: {
  filters: HistoryFilters;
  monthEndAt: number;
  monthStartAt: number;
}): Promise<HistoryWorkoutListItem[]> => {
  const { endAt, startAt } = buildDateRange(input.filters.dateRangeDays);
  const searchQuery = input.filters.searchQuery.trim();
  const searchPattern = buildSearchPattern(searchQuery);
  const effectiveStart = Math.max(startAt, input.monthStartAt);
  const effectiveEnd = Math.min(endAt, input.monthEndAt);

  if (effectiveEnd <= effectiveStart) {
    return [];
  }

  const rows = await runRawQuery(
    `
      ${historyQuery}
      and workouts.started_at >= ?
      and workouts.started_at < ?
      order by workouts.started_at desc
    `,
    [
      startAt,
      endAt,
      searchQuery,
      searchPattern,
      searchPattern,
      effectiveStart,
      effectiveEnd,
    ],
  );

  return rows.map(mapHistoryRow);
};

export const loadWorkoutDetail = async (workoutId: string): Promise<WorkoutDetailData> => {
  const summaryRows = await runRawQuery(
    `
      select
        workouts.id as workout_id,
        workouts.started_at as started_at,
        workouts.duration_seconds as duration_seconds,
        workouts.total_volume as total_volume,
        workouts.total_sets as total_sets,
        workouts.rating as rating,
        workouts.notes as notes,
        plan_days.name as plan_day_name,
        count(distinct workout_exercises.id) as exercise_count
      from workouts
      left join plan_days on plan_days.id = workouts.plan_day_id and plan_days._status is not 'deleted'
      left join workout_exercises on workout_exercises.workout_id = workouts.id and workout_exercises._status is not 'deleted'
      where workouts._status is not 'deleted'
        and workouts.id = ?
      group by workouts.id, workouts.started_at, workouts.duration_seconds, workouts.total_volume, workouts.total_sets, workouts.rating, workouts.notes, plan_days.name
      limit 1
    `,
    [workoutId],
  );

  const summary = summaryRows[0];
  if (!summary) {
    throw new Error("Workout not found");
  }

  const setRows = await runRawQuery(
    `
      select
        workout_exercises.id as workout_exercise_id,
        workout_exercises.volume as exercise_volume,
        workout_exercises.sort_order as exercise_sort_order,
        exercises.id as exercise_id,
        exercises.name as exercise_name,
        workout_sets.id as workout_set_id,
        workout_sets.set_number as set_number,
        workout_sets.weight as weight,
        workout_sets.reps as reps,
        workout_sets.rpe as rpe,
        workout_sets.is_warmup as is_warmup,
        workout_sets.is_completed as is_completed,
        workout_sets.is_pr as is_pr,
        workout_sets.unit as unit,
        workout_sets.rest_seconds as rest_seconds
      from workout_exercises
      inner join exercises on exercises.id = workout_exercises.exercise_id
      left join workout_sets on workout_sets.workout_exercise_id = workout_exercises.id and workout_sets._status is not 'deleted'
      where workout_exercises._status is not 'deleted'
        and exercises._status is not 'deleted'
        and workout_exercises.workout_id = ?
      order by workout_exercises.sort_order asc, workout_sets.set_number asc
    `,
    [workoutId],
  );

  const exercises = new Map<string, WorkoutDetailExercise>();
  for (const row of setRows) {
    const workoutExerciseId = toString(row.workout_exercise_id);
    const existing = exercises.get(workoutExerciseId);
    const baseExercise =
      existing ??
      {
        exerciseId: toString(row.exercise_id),
        name: toString(row.exercise_name),
        sets: [],
        volume: toNumber(row.exercise_volume),
        workoutExerciseId,
      };

    if (row.set_number !== null && row.set_number !== undefined) {
      baseExercise.sets.push({
        isCompleted: toBoolean(row.is_completed),
        isPr: toBoolean(row.is_pr),
        isWarmup: toBoolean(row.is_warmup),
        reps: toNullableNumber(row.reps),
        restSeconds: toNullableNumber(row.rest_seconds),
        rpe: toNullableNumber(row.rpe),
        setNumber: toNumber(row.set_number),
        unit: toString(row.unit),
        weight: toNullableNumber(row.weight),
        workoutSetId: toString(row.workout_set_id),
      });
    }

    exercises.set(workoutExerciseId, baseExercise);
  }

  return {
    dateLabel: formatDateTimeLabel(toNumber(summary.started_at)),
    durationSeconds: toNumber(summary.duration_seconds),
    exerciseCount: toNumber(summary.exercise_count),
    exercises: Array.from(exercises.values()),
    notes: toNullableString(summary.notes) ?? "",
    rating: toNullableNumber(summary.rating),
    title: toNullableString(summary.plan_day_name) ?? "自由训练",
    totalSets: toNumber(summary.total_sets),
    totalVolume: toNumber(summary.total_volume),
    workoutId: toString(summary.workout_id),
  };
};
