import { Q } from "@nozbe/watermelondb";

import { PRType, WeightUnit } from "../constants/enums";
import { database } from "../database";
import { PersonalRecord, WorkoutSet } from "../models";
import {
  queueSyncChange,
  serializePersonalRecordRecord,
  serializeWorkoutSetRecord,
} from "./SyncService";
import { convertWeight, estimate1RM } from "../utils";

export interface PRSetData {
  achievedAt: number;
  isWarmup: boolean;
  reps: number | null;
  unit: WeightUnit;
  weight: number | null;
  workoutSetId: string;
}

export interface PRHit {
  displayUnit: string;
  displayValue: number;
  label: string;
  type: PRType;
  value: number;
}

export interface PRHistoryItem {
  achievedAt: number;
  exerciseId: string;
  id: string;
  prType: PRType;
  value: number;
  workoutSetId: string;
}

export interface RecentPRItem extends PRHistoryItem {
  exerciseName: string;
}

interface RawRow extends Record<string, unknown> {}

const KG_PER_LB = 0.45359237;

const toKg = (weight: number, unit: WeightUnit): number =>
  unit === WeightUnit.LBS ? convertWeight(weight, WeightUnit.LBS, WeightUnit.KG) : weight;

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

const runRawQuery = async (
  sql: string,
  placeholders: unknown[] = [],
): Promise<RawRow[]> =>
  (await database
    .get<PersonalRecord>("personal_records")
    .query(Q.unsafeSqlQuery(sql, placeholders))
    .unsafeFetchRaw()) as RawRow[];

const prLabels: Record<PRType, string> = {
  [PRType.Estimated1RM]: "估算 1RM",
  [PRType.MaxVolume]: "最大单组容量",
  [PRType.MaxWeight]: "最大重量",
};

const buildPRHit = (
  type: PRType,
  canonicalValue: number,
  setData: PRSetData,
): PRHit => {
  const weight = setData.weight ?? 0;
  const reps = setData.reps ?? 0;

  if (type === PRType.MaxVolume) {
    return {
      displayUnit: `${setData.unit}·rep`,
      displayValue: Number((weight * reps).toFixed(1)),
      label: prLabels[type],
      type,
      value: Number(canonicalValue.toFixed(2)),
    };
  }

  if (type === PRType.Estimated1RM) {
    return {
      displayUnit: setData.unit,
      displayValue: Number(estimate1RM(weight, reps, "epley").toFixed(1)),
      label: prLabels[type],
      type,
      value: Number(canonicalValue.toFixed(2)),
    };
  }

  return {
    displayUnit: setData.unit,
    displayValue: Number(weight.toFixed(2)),
    label: prLabels[type],
    type,
    value: Number(canonicalValue.toFixed(2)),
  };
};

export const checkForPR = async (
  exerciseId: string,
  setData: PRSetData,
): Promise<PRHit[]> => {
  if (
    setData.isWarmup ||
    setData.weight === null ||
    setData.reps === null ||
    setData.weight <= 0 ||
    setData.reps <= 0
  ) {
    return [];
  }

  const duplicateCount = await database
    .get<PersonalRecord>("personal_records")
    .query(Q.where("workout_set_id", setData.workoutSetId))
    .fetchCount();

  if (duplicateCount > 0) {
    return [];
  }

  const [bestRow] = await runRawQuery(
    `
      select
        max(case
          when workout_sets.weight is null then null
          when workout_sets.unit = 'lbs' then workout_sets.weight * ?
          else workout_sets.weight
        end) as best_weight,
        max(
          (case
            when workout_sets.weight is null then 0
            when workout_sets.unit = 'lbs' then workout_sets.weight * ?
            else workout_sets.weight
          end) * ifnull(workout_sets.reps, 0)
        ) as best_volume,
        max(
          (case
            when workout_sets.weight is null then 0
            when workout_sets.unit = 'lbs' then workout_sets.weight * ?
            else workout_sets.weight
          end) * (1 + ifnull(workout_sets.reps, 0) / 30.0)
        ) as best_e1rm
      from workout_sets
      inner join workout_exercises
        on workout_exercises.id = workout_sets.workout_exercise_id
      where workout_sets._status is not 'deleted'
        and workout_exercises._status is not 'deleted'
        and workout_exercises.exercise_id = ?
        and workout_sets.is_completed = 1
        and workout_sets.is_warmup = 0
        and workout_sets.id != ?
    `,
    [KG_PER_LB, KG_PER_LB, KG_PER_LB, exerciseId, setData.workoutSetId],
  );

  const currentWeightKg = toKg(setData.weight, setData.unit);
  const currentVolumeKg = currentWeightKg * setData.reps;
  const currentEstimated1RMKg = estimate1RM(currentWeightKg, setData.reps, "epley");

  const hits: PRHit[] = [];

  if (currentWeightKg > toNumber(bestRow?.best_weight)) {
    hits.push(buildPRHit(PRType.MaxWeight, currentWeightKg, setData));
  }

  if (currentVolumeKg > toNumber(bestRow?.best_volume)) {
    hits.push(buildPRHit(PRType.MaxVolume, currentVolumeKg, setData));
  }

  if (currentEstimated1RMKg > toNumber(bestRow?.best_e1rm)) {
    hits.push(buildPRHit(PRType.Estimated1RM, currentEstimated1RMKg, setData));
  }

  if (hits.length === 0) {
    return [];
  }

  const workoutSet = await database.get<WorkoutSet>("workout_sets").find(setData.workoutSetId);
  const recordCollection = database.get<PersonalRecord>("personal_records");

  await database.write(async () => {
    const updatedAt = Date.now();
    await workoutSet.update((record) => {
      record.isPr = true;
      record.updatedAt = updatedAt;
    });

    await queueSyncChange({
      action: "update",
      payload: serializeWorkoutSetRecord(workoutSet),
      recordId: workoutSet.id,
      table: "workout_sets",
    });

    for (const hit of hits) {
      const personalRecord = await recordCollection.create((record) => {
        record.exerciseId = exerciseId;
        record.prType = hit.type;
        record.value = hit.value;
        record.workoutSetId = setData.workoutSetId;
        record.achievedAt = setData.achievedAt;
        record.updatedAt = updatedAt;
      });

      await queueSyncChange({
        action: "create",
        payload: serializePersonalRecordRecord(personalRecord),
        recordId: personalRecord.id,
        table: "personal_records",
      });
    }
  });

  return hits;
};

export const getPRHistory = async (exerciseId: string): Promise<PRHistoryItem[]> => {
  const rows = await runRawQuery(
    `
      select
        id,
        exercise_id,
        pr_type,
        value,
        workout_set_id,
        achieved_at
      from personal_records
      where _status is not 'deleted'
        and exercise_id = ?
      order by achieved_at asc
    `,
    [exerciseId],
  );

  return rows.map((row) => ({
    achievedAt: toNumber(row.achieved_at),
    exerciseId: toString(row.exercise_id),
    id: toString(row.id),
    prType: toString(row.pr_type) as PRType,
    value: toNumber(row.value),
    workoutSetId: toString(row.workout_set_id),
  }));
};

export const getRecentPRs = async (limit: number): Promise<RecentPRItem[]> => {
  const rows = await runRawQuery(
    `
      select
        personal_records.id as id,
        personal_records.exercise_id as exercise_id,
        personal_records.pr_type as pr_type,
        personal_records.value as value,
        personal_records.workout_set_id as workout_set_id,
        personal_records.achieved_at as achieved_at,
        exercises.name as exercise_name
      from personal_records
      inner join exercises on exercises.id = personal_records.exercise_id
      where personal_records._status is not 'deleted'
        and exercises._status is not 'deleted'
      order by personal_records.achieved_at desc
      limit ?
    `,
    [Math.max(1, Math.round(limit))],
  );

  return rows.map((row) => ({
    achievedAt: toNumber(row.achieved_at),
    exerciseId: toString(row.exercise_id),
    exerciseName: toString(row.exercise_name),
    id: toString(row.id),
    prType: toString(row.pr_type) as PRType,
    value: toNumber(row.value),
    workoutSetId: toString(row.workout_set_id),
  }));
};
