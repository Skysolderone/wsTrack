import { Q } from "@nozbe/watermelondb";

import { WeightUnit } from "../constants/enums";
import { database } from "../database";
import type { Workout } from "../models";
import { getWeeklyVolumeComparison } from "./AnalyticsService";
import { convertWeight } from "../utils";
import { useSettingsStore } from "../store/settingsStore";

const FOUR_WEEKS_MS = 28 * 24 * 60 * 60 * 1000;
const PLATEAU_WEEKS = 3;
const KG_INCREMENT = 2.5;
const LBS_INCREMENT = 5;

type SuggestionConfidence = "high" | "low" | "medium";

export interface ProgressionSuggestion {
  confidence: SuggestionConfidence;
  exerciseId: string;
  reason: string;
  suggestedReps: number;
  suggestedWeight: number;
}

export interface PlateauDetection {
  exerciseId: string;
  message: string;
  unchangedWeeks: number;
}

export interface FatigueRiskWarning {
  deltaVolume: number;
  message: string;
  percentIncrease: number;
}

interface RawRow extends Record<string, unknown> {}

interface RecentSetRow {
  reps: number;
  rpe: number | null;
  unit: WeightUnit;
  volume: number;
  weight: number;
}

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

const toWeightUnit = (value: unknown): WeightUnit =>
  value === WeightUnit.LBS ? WeightUnit.LBS : WeightUnit.KG;

const runRawQuery = async (
  sql: string,
  placeholders: unknown[] = [],
): Promise<RawRow[]> =>
  (await database
    .get<Workout>("workouts")
    .query(Q.unsafeSqlQuery(sql, placeholders))
    .unsafeFetchRaw()) as RawRow[];

const resolveTargetReps = async (exerciseId: string): Promise<number> => {
  const [row] = await runRawQuery(
    `
      select plan_exercises.target_reps as target_reps
      from plan_exercises
      inner join plan_days on plan_days.id = plan_exercises.day_id
      inner join plans on plans.id = plan_days.plan_id
      where plan_exercises._status is not 'deleted'
        and plan_days._status is not 'deleted'
        and plans._status is not 'deleted'
        and plans.is_archived = 0
        and plan_exercises.exercise_id = ?
      order by plans.is_active desc, plans.updated_at desc, plan_exercises.updated_at desc
      limit 1
    `,
    [exerciseId],
  );

  const rawTarget = typeof row?.target_reps === "string" ? row.target_reps.trim() : "";
  if (!rawTarget) {
    return 8;
  }

  const rangeParts = rawTarget.split("-").map((part) => Number(part.trim()));
  const numericParts = rangeParts.filter((part) => Number.isFinite(part) && part > 0);
  if (numericParts.length === 0) {
    return 8;
  }

  return Math.max(...numericParts);
};

const toPreferredUnitWeight = (weight: number, fromUnit: WeightUnit): number => {
  const targetUnit = useSettingsStore.getState().weightUnit;

  if (fromUnit === targetUnit) {
    return weight;
  }

  return convertWeight(weight, fromUnit, targetUnit);
};

const roundToNearestIncrement = (value: number): number => {
  const targetUnit = useSettingsStore.getState().weightUnit;
  const increment = targetUnit === WeightUnit.LBS ? LBS_INCREMENT : KG_INCREMENT;

  return Number((Math.round(value / increment) * increment).toFixed(2));
};

const loadRecentSets = async (exerciseId: string): Promise<RecentSetRow[]> => {
  const rows = await runRawQuery(
    `
      select
        workout_sets.weight as weight,
        workout_sets.reps as reps,
        workout_sets.rpe as rpe,
        workout_sets.unit as unit,
        ifnull(workout_sets.weight, 0) * ifnull(workout_sets.reps, 0) as volume
      from workout_sets
      inner join workout_exercises on workout_exercises.id = workout_sets.workout_exercise_id
      inner join workouts on workouts.id = workout_exercises.workout_id
      where workout_sets._status is not 'deleted'
        and workout_exercises._status is not 'deleted'
        and workouts._status is not 'deleted'
        and workouts.finished_at is not null
        and workout_sets.is_completed = 1
        and workout_sets.is_warmup = 0
        and workout_exercises.exercise_id = ?
        and workouts.started_at >= ?
      order by workouts.started_at desc, workout_sets.set_number asc
    `,
    [exerciseId, Date.now() - FOUR_WEEKS_MS],
  );

  return rows
    .map((row) => ({
      reps: toNumber(row.reps),
      rpe: toNullableNumber(row.rpe),
      unit: toWeightUnit(row.unit),
      volume: toNumber(row.volume),
      weight: toNumber(row.weight),
    }))
    .filter((row) => row.weight > 0 && row.reps > 0);
};

export const getSuggestion = async (
  exerciseId: string,
): Promise<ProgressionSuggestion> => {
  const [recentSets, targetReps] = await Promise.all([
    loadRecentSets(exerciseId),
    resolveTargetReps(exerciseId),
  ]);

  if (recentSets.length === 0) {
    return {
      confidence: "low",
      exerciseId,
      reason: "最近 4 周没有足够数据，建议先用保守重量完成目标次数。",
      suggestedReps: targetReps,
      suggestedWeight: 0,
    };
  }

  const bestSet = [...recentSets].sort((left, right) => right.volume - left.volume)[0];
  const bestWeight = toPreferredUnitWeight(bestSet.weight, bestSet.unit);
  const averageRpe =
    recentSets
      .map((set) => set.rpe)
      .filter((rpe): rpe is number => rpe !== null)
      .reduce((sum, rpe, _, list) => sum + rpe / list.length, 0) || 0;
  const hitTarget = bestSet.reps >= targetReps;
  const confidence: SuggestionConfidence =
    recentSets.length >= 8 ? "high" : recentSets.length >= 4 ? "medium" : "low";

  if (averageRpe < 7 && hitTarget) {
    return {
      confidence,
      exerciseId,
      reason: "RPE较低且已达到目标次数，建议增加约 5%。",
      suggestedReps: targetReps,
      suggestedWeight: roundToNearestIncrement(bestWeight * 1.05),
    };
  }

  if (averageRpe >= 7 && averageRpe < 8 && hitTarget) {
    return {
      confidence,
      exerciseId,
      reason: "RPE适中且次数达标，建议小幅增加一个标准档位。",
      suggestedReps: targetReps,
      suggestedWeight: roundToNearestIncrement(
        bestWeight + (useSettingsStore.getState().weightUnit === WeightUnit.LBS ? 5 : 2.5),
      ),
    };
  }

  if (averageRpe >= 8 && averageRpe <= 9 && hitTarget) {
    return {
      confidence,
      exerciseId,
      reason: "上次已接近有效强度区间，建议保持当前重量继续巩固。",
      suggestedReps: targetReps,
      suggestedWeight: roundToNearestIncrement(bestWeight),
    };
  }

  return {
    confidence,
    exerciseId,
    reason: hitTarget
      ? "RPE偏高，建议轻微降重控制疲劳。"
      : "上次次数未达标，建议先降重 5% 或减少目标次数。",
    suggestedReps: Math.max(1, hitTarget ? targetReps : targetReps - 1),
    suggestedWeight: roundToNearestIncrement(bestWeight * 0.95),
  };
};

export const detectPlateau = async (
  exerciseId: string,
): Promise<PlateauDetection | null> => {
  const rows = await runRawQuery(
    `
      select
        cast((workouts.started_at - ?) / ? as integer) as week_index,
        max(
          case
            when workout_sets.unit = 'lbs'
              then workout_sets.weight * 0.45359237
            else workout_sets.weight
          end
        ) as max_weight_kg
      from workout_sets
      inner join workout_exercises on workout_exercises.id = workout_sets.workout_exercise_id
      inner join workouts on workouts.id = workout_exercises.workout_id
      where workout_sets._status is not 'deleted'
        and workout_exercises._status is not 'deleted'
        and workouts._status is not 'deleted'
        and workouts.finished_at is not null
        and workout_sets.is_completed = 1
        and workout_sets.is_warmup = 0
        and workout_exercises.exercise_id = ?
        and workouts.started_at >= ?
      group by week_index
      order by week_index desc
      limit ?
    `,
    [
      Date.now() - PLATEAU_WEEKS * 7 * 24 * 60 * 60 * 1000,
      7 * 24 * 60 * 60 * 1000,
      exerciseId,
      Date.now() - PLATEAU_WEEKS * 7 * 24 * 60 * 60 * 1000,
      PLATEAU_WEEKS,
    ],
  );

  if (rows.length < PLATEAU_WEEKS) {
    return null;
  }

  const weights = rows.map((row) => Number(toNumber(row.max_weight_kg).toFixed(2)));
  const firstWeight = weights[0];
  if (!firstWeight || weights.some((weight) => weight !== firstWeight)) {
    return null;
  }

  return {
    exerciseId,
    message: `连续 ${PLATEAU_WEEKS} 周最大重量没有变化，可能进入平台期。`,
    unchangedWeeks: PLATEAU_WEEKS,
  };
};

export const checkFatigueRisk = async (): Promise<FatigueRiskWarning | null> => {
  const comparison = await getWeeklyVolumeComparison();
  const percentIncrease = comparison.percentChange ?? 0;

  if (percentIncrease <= 15) {
    return null;
  }

  return {
    deltaVolume: comparison.delta,
    message: `本周容量较上周增加 ${percentIncrease.toFixed(1)}%，疲劳风险偏高，建议控制加量节奏。`,
    percentIncrease,
  };
};
