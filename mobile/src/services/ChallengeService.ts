import { Q } from "@nozbe/watermelondb";

import { ChallengeType } from "../constants/enums";
import { database } from "../database";
import { Challenge, type Workout } from "../models";
import { queueSyncChange, serializeChallengeRecord } from "./SyncService";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ChallengeItem {
  createdAt: number;
  currentValue: number;
  endDate: number;
  id: string;
  isCompleted: boolean;
  progressPercent: number;
  remainingDays: number;
  startDate: number;
  targetValue: number;
  type: ChallengeType;
  updatedAt: number;
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

const runWorkoutQuery = async (
  sql: string,
  placeholders: unknown[] = [],
): Promise<RawRow[]> =>
  (await database
    .get<Workout>("workouts")
    .query(Q.unsafeSqlQuery(sql, placeholders))
    .unsafeFetchRaw()) as RawRow[];

const toChallengeItem = (record: Challenge): ChallengeItem => ({
  createdAt: record.createdAt,
  currentValue: record.currentValue,
  endDate: record.endDate,
  id: record.id,
  isCompleted: record.isCompleted,
  progressPercent:
    record.targetValue > 0
      ? Math.min(100, Number(((record.currentValue / record.targetValue) * 100).toFixed(1)))
      : 0,
  remainingDays: Math.max(0, Math.ceil((record.endDate - Date.now()) / DAY_MS)),
  startDate: record.startDate,
  targetValue: record.targetValue,
  type: record.type,
  updatedAt: record.updatedAt,
});

const resolveTimeSlotProgress = async (challenge: Challenge): Promise<number> => {
  const preferredHour = new Date(challenge.createdAt).getHours();
  const rows = await runWorkoutQuery(
    `
      select workouts.started_at as started_at
      from workouts
      where workouts._status is not 'deleted'
        and workouts.finished_at is not null
        and workouts.started_at >= ?
        and workouts.started_at < ?
    `,
    [challenge.startDate, challenge.endDate + DAY_MS],
  );

  return rows.filter((row) => {
    const hour = new Date(toNumber(row.started_at)).getHours();
    return Math.abs(hour - preferredHour) <= 1;
  }).length;
};

const resolveCardioDurationProgress = async (challenge: Challenge): Promise<number> => {
  const [setRow] = await runWorkoutQuery(
    `
      select
        sum(ifnull(workout_sets.duration_seconds, 0)) as total_duration
      from workout_sets
      inner join workout_exercises on workout_exercises.id = workout_sets.workout_exercise_id
      inner join workouts on workouts.id = workout_exercises.workout_id
      inner join exercises on exercises.id = workout_exercises.exercise_id
      where workout_sets._status is not 'deleted'
        and workout_exercises._status is not 'deleted'
        and workouts._status is not 'deleted'
        and exercises._status is not 'deleted'
        and workouts.finished_at is not null
        and workouts.started_at >= ?
        and workouts.started_at < ?
        and (
          exercises.category = 'cardio'
          or exercises.tracking_type = 'time'
          or exercises.tracking_type = 'distance'
        )
    `,
    [challenge.startDate, challenge.endDate + DAY_MS],
  );

  const totalDuration = toNumber(setRow?.total_duration);
  if (totalDuration > 0) {
    return totalDuration;
  }

  const [fallbackRow] = await runWorkoutQuery(
    `
      select
        sum(workouts.duration_seconds) as total_duration
      from workouts
      where workouts._status is not 'deleted'
        and workouts.finished_at is not null
        and workouts.started_at >= ?
        and workouts.started_at < ?
    `,
    [challenge.startDate, challenge.endDate + DAY_MS],
  );

  return toNumber(fallbackRow?.total_duration);
};

const resolveChallengeProgress = async (challenge: Challenge): Promise<number> => {
  switch (challenge.type) {
    case ChallengeType.Volume: {
      const [row] = await runWorkoutQuery(
        `
          select sum(total_volume) as progress
          from workouts
          where _status is not 'deleted'
            and finished_at is not null
            and started_at >= ?
            and started_at < ?
        `,
        [challenge.startDate, challenge.endDate + DAY_MS],
      );

      return Number(toNumber(row?.progress).toFixed(2));
    }
    case ChallengeType.Frequency: {
      const [row] = await runWorkoutQuery(
        `
          select count(*) as progress
          from workouts
          where _status is not 'deleted'
            and finished_at is not null
            and started_at >= ?
            and started_at < ?
        `,
        [challenge.startDate, challenge.endDate + DAY_MS],
      );

      return toNumber(row?.progress);
    }
    case ChallengeType.TimeSlot:
      return resolveTimeSlotProgress(challenge);
    case ChallengeType.CardioDuration:
      return resolveCardioDurationProgress(challenge);
    default:
      return 0;
  }
};

export const createChallenge = async (
  type: ChallengeType,
  target: number,
  startDate: Date,
  endDate: Date,
): Promise<string> => {
  const challengeCollection = database.get<Challenge>("challenges");
  const timestamp = Date.now();
  let challengeId = "";

  await database.write(async () => {
    const challenge = await challengeCollection.create((record) => {
      record.type = type;
      record.targetValue = Math.max(1, Number(target.toFixed(2)));
      record.currentValue = 0;
      record.startDate = startDate.getTime();
      record.endDate = endDate.getTime();
      record.isCompleted = false;
      record.createdAt = timestamp;
      record.updatedAt = timestamp;
    });

    await queueSyncChange({
      action: "create",
      payload: serializeChallengeRecord(challenge),
      recordId: challenge.id,
      table: "challenges",
    });

    challengeId = challenge.id;
  });

  return challengeId;
};

export const updateProgress = async (): Promise<ChallengeItem[]> => {
  const challenges = await database
    .get<Challenge>("challenges")
    .query(Q.where("is_completed", false), Q.sortBy("created_at", Q.asc))
    .fetch();

  if (challenges.length === 0) {
    return [];
  }

  const progressEntries = await Promise.all(
    challenges.map(async (challenge) => ({
      challenge,
      progress: await resolveChallengeProgress(challenge),
    })),
  );

  await database.write(async () => {
    for (const entry of progressEntries) {
      const updatedAt = Date.now();
      await entry.challenge.update((record) => {
        record.currentValue = entry.progress;
        record.updatedAt = updatedAt;
      });

      await queueSyncChange({
        action: "update",
        payload: serializeChallengeRecord(entry.challenge),
        recordId: entry.challenge.id,
        table: "challenges",
      });
    }
  });

  return checkCompletion();
};

export const getActiveChallenges = async (): Promise<ChallengeItem[]> => {
  const records = await database
    .get<Challenge>("challenges")
    .query(
      Q.where("is_completed", false),
      Q.where("end_date", Q.gte(Date.now())),
      Q.sortBy("end_date", Q.asc),
    )
    .fetch();

  return records.map(toChallengeItem);
};

export const getCompletedChallenges = async (): Promise<ChallengeItem[]> => {
  const records = await database
    .get<Challenge>("challenges")
    .query(Q.where("is_completed", true), Q.sortBy("updated_at", Q.desc))
    .fetch();

  return records.map(toChallengeItem);
};

export const checkCompletion = async (): Promise<ChallengeItem[]> => {
  const records = await database
    .get<Challenge>("challenges")
    .query(Q.where("is_completed", false))
    .fetch();

  const completed = records.filter((record) => record.currentValue >= record.targetValue);
  if (completed.length === 0) {
    return [];
  }

  await database.write(async () => {
    for (const challenge of completed) {
      const updatedAt = Date.now();
      await challenge.update((record) => {
        record.isCompleted = true;
        record.updatedAt = updatedAt;
      });

      await queueSyncChange({
        action: "update",
        payload: serializeChallengeRecord(challenge),
        recordId: challenge.id,
        table: "challenges",
      });
    }
  });

  return completed.map(toChallengeItem);
};
