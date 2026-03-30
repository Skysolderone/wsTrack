import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { Q } from "@nozbe/watermelondb";
import type { Model } from "@nozbe/watermelondb";
import type { NativeEventSubscription } from "react-native";
import { AppState } from "react-native";

import type {
  ChallengeType,
  Equipment,
  ExerciseCategory,
  MuscleGroup,
  PlanGoal,
  PRType,
  TrackingType,
  WeightUnit,
} from "../constants/enums";
import { database } from "../database";
import {
  Challenge,
  Exercise,
  PersonalRecord,
  Plan,
  PlanDay,
  PlanExercise,
  SyncQueue,
  Template,
  TemplateDay,
  TemplateExercise,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from "../models";
import { useAuthStore } from "../store/authStore";
import { api, extractApiData } from "./api";
import { WORKOUTS } from "./apiEndpoints";

const LAST_SYNC_AT_STORAGE_PREFIX = "sync:last_sync_at:";

export type SyncActionType = "create" | "update" | "delete";

export interface SyncObject {
  [key: string]: SyncValue;
}

export type SyncValue = boolean | null | number | string | SyncObject | SyncValue[];

export interface ExerciseSyncPayload {
  category: ExerciseCategory;
  created_at: number;
  equipment: Equipment;
  id: string;
  is_archived: boolean;
  is_custom: boolean;
  name: string;
  name_en: string | null;
  notes: string | null;
  primary_muscles: MuscleGroup[];
  secondary_muscles: MuscleGroup[];
  sort_order: number;
  tracking_type: TrackingType;
  unit_preference: WeightUnit | null;
  updated_at: number;
}

export interface ChallengeSyncPayload {
  created_at: number;
  current_value: number;
  end_date: number;
  id: string;
  is_completed: boolean;
  start_date: number;
  target_value: number;
  type: ChallengeType;
  updated_at: number;
}

export interface PlanSyncPayload {
  created_at: number;
  description: string | null;
  goal: PlanGoal | null;
  id: string;
  is_active: boolean;
  is_archived: boolean;
  name: string;
  updated_at: number;
}

export interface PlanDaySyncPayload {
  id: string;
  name: string;
  plan_id: string;
  sort_order: number;
  updated_at: number;
}

export interface PlanExerciseSyncPayload {
  day_id: string;
  exercise_id: string;
  id: string;
  notes: string | null;
  rest_seconds: number | null;
  sort_order: number;
  superset_group: number | null;
  target_reps: string | null;
  target_sets: number;
  target_weight: number | null;
  updated_at: number;
}

export interface WorkoutSyncPayload {
  duration_seconds: number;
  finished_at: number | null;
  id: string;
  notes: string | null;
  plan_day_id: string | null;
  rating: number | null;
  started_at: number;
  total_sets: number;
  total_volume: number;
  updated_at: number;
}

export interface WorkoutExerciseSyncPayload {
  exercise_id: string;
  id: string;
  notes: string | null;
  sort_order: number;
  updated_at: number;
  volume: number;
  workout_id: string;
}

export interface WorkoutSetSyncPayload {
  completed_at: number | null;
  distance: number | null;
  duration_seconds: number | null;
  id: string;
  is_completed: boolean;
  is_pr: boolean;
  is_warmup: boolean;
  reps: number | null;
  rest_seconds: number | null;
  rpe: number | null;
  set_number: number;
  unit: WeightUnit;
  updated_at: number;
  weight: number | null;
  workout_exercise_id: string;
}

export interface PersonalRecordSyncPayload {
  achieved_at: number;
  exercise_id: string;
  id: string;
  pr_type: PRType;
  updated_at: number;
  value: number;
  workout_set_id: string;
}

export interface TemplateSyncPayload {
  created_at: number;
  description: string | null;
  goal: PlanGoal | null;
  id: string;
  is_archived: boolean;
  is_built_in: boolean;
  name: string;
  source_plan_id: string | null;
  updated_at: number;
}

export interface TemplateDaySyncPayload {
  id: string;
  name: string;
  sort_order: number;
  template_id: string;
  updated_at: number;
}

export interface TemplateExerciseSyncPayload {
  exercise_id: string;
  id: string;
  notes: string | null;
  rest_seconds: number | null;
  sort_order: number;
  superset_group: number | null;
  target_reps: string | null;
  target_sets: number;
  target_weight: number | null;
  template_day_id: string;
  updated_at: number;
}

export interface SyncPayloadByTable {
  challenges: ChallengeSyncPayload;
  exercises: ExerciseSyncPayload;
  personal_records: PersonalRecordSyncPayload;
  plan_days: PlanDaySyncPayload;
  plan_exercises: PlanExerciseSyncPayload;
  plans: PlanSyncPayload;
  template_days: TemplateDaySyncPayload;
  template_exercises: TemplateExerciseSyncPayload;
  templates: TemplateSyncPayload;
  workout_exercises: WorkoutExerciseSyncPayload;
  workout_sets: WorkoutSetSyncPayload;
  workouts: WorkoutSyncPayload;
}

export type SyncTableName = keyof SyncPayloadByTable;

export interface QueueSyncChangeInput<T extends SyncTableName = SyncTableName> {
  action: SyncActionType;
  payload: SyncPayloadByTable[T];
  recordId: string;
  table: T;
}

interface SyncQueueItem<T extends SyncTableName = SyncTableName> {
  action: SyncActionType;
  created_at: number;
  id: string;
  payload: SyncPayloadByTable[T];
  record_id: string;
  table: T;
}

interface SyncPushResponse {
  accepted_count?: number;
  last_sync_at?: number;
}

interface SyncPullResponse {
  changes?: SyncQueueItem[];
  last_sync_at?: number;
}

export interface SyncResult {
  lastSyncAt: number | null;
  pulled: number;
  pushed: number;
}

export interface SyncStatus {
  lastSyncAt: number | null;
  pendingCount: number;
}

let syncPromise: Promise<SyncResult> | null = null;
let appStateSubscription: NativeEventSubscription | null = null;
let stopNetInfoSubscription: (() => void) | null = null;

const remoteApplyOrder: Record<SyncTableName, number> = {
  challenges: 1,
  exercises: 2,
  plans: 3,
  plan_days: 4,
  plan_exercises: 5,
  templates: 6,
  template_days: 7,
  template_exercises: 8,
  workouts: 9,
  workout_exercises: 10,
  workout_sets: 11,
  personal_records: 12,
};

const getRemoteChangePriority = (change: SyncQueueItem): number => {
  const basePriority = remoteApplyOrder[change.table];
  return change.action === "delete" ? 100 - basePriority : basePriority;
};

const parseQueuePayload = <T extends SyncTableName>(
  entry: SyncQueue,
): SyncPayloadByTable[T] => JSON.parse(entry.payload) as SyncPayloadByTable[T];

const getLastSyncStorageKey = (): string => {
  const userId = useAuthStore.getState().user?.id ?? "guest";
  return `${LAST_SYNC_AT_STORAGE_PREFIX}${userId}`;
};

const getLastSyncAt = async (): Promise<number | null> => {
  const raw = await AsyncStorage.getItem(getLastSyncStorageKey());
  if (!raw) {
    return null;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

const setLastSyncAt = async (timestamp: number | null): Promise<void> => {
  const key = getLastSyncStorageKey();

  if (timestamp === null) {
    await AsyncStorage.removeItem(key);
    return;
  }

  await AsyncStorage.setItem(key, `${timestamp}`);
};

const isRemoteNewer = (localUpdatedAt: number | null, remoteUpdatedAt: number): boolean =>
  localUpdatedAt === null || remoteUpdatedAt >= localUpdatedAt;

const isOnline = async (): Promise<boolean> => {
  const networkState = await NetInfo.fetch();
  return networkState.isConnected === true && networkState.isInternetReachable !== false;
};

const findRecordById = async <T extends Model>(
  table: SyncTableName,
  id: string,
): Promise<T | null> => {
  try {
    return await database.get<T>(table).find(id);
  } catch {
    return null;
  }
};

const removeRemoteDeletedRecord = async <T extends Model>(record: T | null): Promise<void> => {
  if (!record) {
    return;
  }

  await record.markAsDeleted();
};

const applyExerciseChange = async (
  action: SyncActionType,
  payload: ExerciseSyncPayload,
): Promise<void> => {
  const record = await findRecordById<Exercise>("exercises", payload.id);

  if (action === "delete") {
    if (!isRemoteNewer(record?.updatedAt ?? null, payload.updated_at)) {
      return;
    }

    await removeRemoteDeletedRecord(record);
    return;
  }

  if (record) {
    if (!isRemoteNewer(record.updatedAt, payload.updated_at)) {
      return;
    }

    await record.update((next) => {
      next.name = payload.name;
      next.nameEn = payload.name_en;
      next.category = payload.category;
      next.primaryMuscles = payload.primary_muscles;
      next.secondaryMuscles = payload.secondary_muscles;
      next.equipment = payload.equipment;
      next.trackingType = payload.tracking_type;
      next.unitPreference = payload.unit_preference;
      next.isCustom = payload.is_custom;
      next.isArchived = payload.is_archived;
      next.notes = payload.notes;
      next.sortOrder = payload.sort_order;
      next.createdAt = payload.created_at;
      next.updatedAt = payload.updated_at;
    });
    return;
  }

  await database.get<Exercise>("exercises").create((next) => {
    next._raw.id = payload.id;
    next.name = payload.name;
    next.nameEn = payload.name_en;
    next.category = payload.category;
    next.primaryMuscles = payload.primary_muscles;
    next.secondaryMuscles = payload.secondary_muscles;
    next.equipment = payload.equipment;
    next.trackingType = payload.tracking_type;
    next.unitPreference = payload.unit_preference;
    next.isCustom = payload.is_custom;
    next.isArchived = payload.is_archived;
    next.notes = payload.notes;
    next.sortOrder = payload.sort_order;
    next.createdAt = payload.created_at;
    next.updatedAt = payload.updated_at;
  });
};

const applyChallengeChange = async (
  action: SyncActionType,
  payload: ChallengeSyncPayload,
): Promise<void> => {
  const record = await findRecordById<Challenge>("challenges", payload.id);

  if (action === "delete") {
    if (!isRemoteNewer(record?.updatedAt ?? null, payload.updated_at)) {
      return;
    }

    await removeRemoteDeletedRecord(record);
    return;
  }

  if (record) {
    if (!isRemoteNewer(record.updatedAt, payload.updated_at)) {
      return;
    }

    await record.update((next) => {
      next.type = payload.type;
      next.targetValue = payload.target_value;
      next.currentValue = payload.current_value;
      next.startDate = payload.start_date;
      next.endDate = payload.end_date;
      next.isCompleted = payload.is_completed;
      next.createdAt = payload.created_at;
      next.updatedAt = payload.updated_at;
    });
    return;
  }

  await database.get<Challenge>("challenges").create((next) => {
    next._raw.id = payload.id;
    next.type = payload.type;
    next.targetValue = payload.target_value;
    next.currentValue = payload.current_value;
    next.startDate = payload.start_date;
    next.endDate = payload.end_date;
    next.isCompleted = payload.is_completed;
    next.createdAt = payload.created_at;
    next.updatedAt = payload.updated_at;
  });
};

const applyPlanChange = async (
  action: SyncActionType,
  payload: PlanSyncPayload,
): Promise<void> => {
  const record = await findRecordById<Plan>("plans", payload.id);

  if (action === "delete") {
    if (!isRemoteNewer(record?.updatedAt ?? null, payload.updated_at)) {
      return;
    }

    await removeRemoteDeletedRecord(record);
    return;
  }

  if (record) {
    if (!isRemoteNewer(record.updatedAt, payload.updated_at)) {
      return;
    }

    await record.update((next) => {
      next.name = payload.name;
      next.description = payload.description;
      next.goal = payload.goal;
      next.isActive = payload.is_active;
      next.isArchived = payload.is_archived;
      next.createdAt = payload.created_at;
      next.updatedAt = payload.updated_at;
    });
    return;
  }

  await database.get<Plan>("plans").create((next) => {
    next._raw.id = payload.id;
    next.name = payload.name;
    next.description = payload.description;
    next.goal = payload.goal;
    next.isActive = payload.is_active;
    next.isArchived = payload.is_archived;
    next.createdAt = payload.created_at;
    next.updatedAt = payload.updated_at;
  });
};

const applyPlanDayChange = async (
  action: SyncActionType,
  payload: PlanDaySyncPayload,
): Promise<void> => {
  const record = await findRecordById<PlanDay>("plan_days", payload.id);

  if (action === "delete") {
    if (!isRemoteNewer(record?.updatedAt ?? null, payload.updated_at)) {
      return;
    }

    await removeRemoteDeletedRecord(record);
    return;
  }

  if (record) {
    if (!isRemoteNewer(record.updatedAt, payload.updated_at)) {
      return;
    }

    await record.update((next) => {
      next.planId = payload.plan_id;
      next.name = payload.name;
      next.sortOrder = payload.sort_order;
      next.updatedAt = payload.updated_at;
    });
    return;
  }

  await database.get<PlanDay>("plan_days").create((next) => {
    next._raw.id = payload.id;
    next.planId = payload.plan_id;
    next.name = payload.name;
    next.sortOrder = payload.sort_order;
    next.updatedAt = payload.updated_at;
  });
};

const applyPlanExerciseChange = async (
  action: SyncActionType,
  payload: PlanExerciseSyncPayload,
): Promise<void> => {
  const record = await findRecordById<PlanExercise>("plan_exercises", payload.id);

  if (action === "delete") {
    if (!isRemoteNewer(record?.updatedAt ?? null, payload.updated_at)) {
      return;
    }

    await removeRemoteDeletedRecord(record);
    return;
  }

  if (record) {
    if (!isRemoteNewer(record.updatedAt, payload.updated_at)) {
      return;
    }

    await record.update((next) => {
      next.dayId = payload.day_id;
      next.exerciseId = payload.exercise_id;
      next.targetSets = payload.target_sets;
      next.targetReps = payload.target_reps;
      next.targetWeight = payload.target_weight;
      next.restSeconds = payload.rest_seconds;
      next.supersetGroup = payload.superset_group;
      next.sortOrder = payload.sort_order;
      next.notes = payload.notes;
      next.updatedAt = payload.updated_at;
    });
    return;
  }

  await database.get<PlanExercise>("plan_exercises").create((next) => {
    next._raw.id = payload.id;
    next.dayId = payload.day_id;
    next.exerciseId = payload.exercise_id;
    next.targetSets = payload.target_sets;
    next.targetReps = payload.target_reps;
    next.targetWeight = payload.target_weight;
    next.restSeconds = payload.rest_seconds;
    next.supersetGroup = payload.superset_group;
    next.sortOrder = payload.sort_order;
    next.notes = payload.notes;
    next.updatedAt = payload.updated_at;
  });
};

const applyWorkoutChange = async (
  action: SyncActionType,
  payload: WorkoutSyncPayload,
): Promise<void> => {
  const record = await findRecordById<Workout>("workouts", payload.id);

  if (action === "delete") {
    if (!isRemoteNewer(record?.updatedAt ?? null, payload.updated_at)) {
      return;
    }

    await removeRemoteDeletedRecord(record);
    return;
  }

  if (record) {
    if (!isRemoteNewer(record.updatedAt, payload.updated_at)) {
      return;
    }

    await record.update((next) => {
      next.planDayId = payload.plan_day_id;
      next.startedAt = payload.started_at;
      next.finishedAt = payload.finished_at;
      next.durationSeconds = payload.duration_seconds;
      next.totalVolume = payload.total_volume;
      next.totalSets = payload.total_sets;
      next.rating = payload.rating;
      next.notes = payload.notes;
      next.updatedAt = payload.updated_at;
    });
    return;
  }

  await database.get<Workout>("workouts").create((next) => {
    next._raw.id = payload.id;
    next.planDayId = payload.plan_day_id;
    next.startedAt = payload.started_at;
    next.finishedAt = payload.finished_at;
    next.durationSeconds = payload.duration_seconds;
    next.totalVolume = payload.total_volume;
    next.totalSets = payload.total_sets;
    next.rating = payload.rating;
    next.notes = payload.notes;
    next.updatedAt = payload.updated_at;
  });
};

const applyWorkoutExerciseChange = async (
  action: SyncActionType,
  payload: WorkoutExerciseSyncPayload,
): Promise<void> => {
  const record = await findRecordById<WorkoutExercise>("workout_exercises", payload.id);

  if (action === "delete") {
    if (!isRemoteNewer(record?.updatedAt ?? null, payload.updated_at)) {
      return;
    }

    await removeRemoteDeletedRecord(record);
    return;
  }

  if (record) {
    if (!isRemoteNewer(record.updatedAt, payload.updated_at)) {
      return;
    }

    await record.update((next) => {
      next.workoutId = payload.workout_id;
      next.exerciseId = payload.exercise_id;
      next.sortOrder = payload.sort_order;
      next.volume = payload.volume;
      next.notes = payload.notes;
      next.updatedAt = payload.updated_at;
    });
    return;
  }

  await database.get<WorkoutExercise>("workout_exercises").create((next) => {
    next._raw.id = payload.id;
    next.workoutId = payload.workout_id;
    next.exerciseId = payload.exercise_id;
    next.sortOrder = payload.sort_order;
    next.volume = payload.volume;
    next.notes = payload.notes;
    next.updatedAt = payload.updated_at;
  });
};

const applyWorkoutSetChange = async (
  action: SyncActionType,
  payload: WorkoutSetSyncPayload,
): Promise<void> => {
  const record = await findRecordById<WorkoutSet>("workout_sets", payload.id);

  if (action === "delete") {
    if (!isRemoteNewer(record?.updatedAt ?? null, payload.updated_at)) {
      return;
    }

    await removeRemoteDeletedRecord(record);
    return;
  }

  if (record) {
    if (!isRemoteNewer(record.updatedAt, payload.updated_at)) {
      return;
    }

    await record.update((next) => {
      next.workoutExerciseId = payload.workout_exercise_id;
      next.setNumber = payload.set_number;
      next.weight = payload.weight;
      next.reps = payload.reps;
      next.durationSeconds = payload.duration_seconds;
      next.distance = payload.distance;
      next.rpe = payload.rpe;
      next.isWarmup = payload.is_warmup;
      next.isCompleted = payload.is_completed;
      next.restSeconds = payload.rest_seconds;
      next.isPr = payload.is_pr;
      next.unit = payload.unit;
      next.completedAt = payload.completed_at;
      next.updatedAt = payload.updated_at;
    });
    return;
  }

  await database.get<WorkoutSet>("workout_sets").create((next) => {
    next._raw.id = payload.id;
    next.workoutExerciseId = payload.workout_exercise_id;
    next.setNumber = payload.set_number;
    next.weight = payload.weight;
    next.reps = payload.reps;
    next.durationSeconds = payload.duration_seconds;
    next.distance = payload.distance;
    next.rpe = payload.rpe;
    next.isWarmup = payload.is_warmup;
    next.isCompleted = payload.is_completed;
    next.restSeconds = payload.rest_seconds;
    next.isPr = payload.is_pr;
    next.unit = payload.unit;
    next.completedAt = payload.completed_at;
    next.updatedAt = payload.updated_at;
  });
};

const applyPersonalRecordChange = async (
  action: SyncActionType,
  payload: PersonalRecordSyncPayload,
): Promise<void> => {
  const record = await findRecordById<PersonalRecord>("personal_records", payload.id);

  if (action === "delete") {
    if (!isRemoteNewer(record?.updatedAt ?? null, payload.updated_at)) {
      return;
    }

    await removeRemoteDeletedRecord(record);
    return;
  }

  if (record) {
    if (!isRemoteNewer(record.updatedAt, payload.updated_at)) {
      return;
    }

    await record.update((next) => {
      next.exerciseId = payload.exercise_id;
      next.prType = payload.pr_type;
      next.value = payload.value;
      next.workoutSetId = payload.workout_set_id;
      next.achievedAt = payload.achieved_at;
      next.updatedAt = payload.updated_at;
    });
    return;
  }

  await database.get<PersonalRecord>("personal_records").create((next) => {
    next._raw.id = payload.id;
    next.exerciseId = payload.exercise_id;
    next.prType = payload.pr_type;
    next.value = payload.value;
    next.workoutSetId = payload.workout_set_id;
    next.achievedAt = payload.achieved_at;
    next.updatedAt = payload.updated_at;
  });
};

const applyTemplateChange = async (
  action: SyncActionType,
  payload: TemplateSyncPayload,
): Promise<void> => {
  const record = await findRecordById<Template>("templates", payload.id);

  if (action === "delete") {
    if (!isRemoteNewer(record?.updatedAt ?? null, payload.updated_at)) {
      return;
    }

    await removeRemoteDeletedRecord(record);
    return;
  }

  if (record) {
    if (!isRemoteNewer(record.updatedAt, payload.updated_at)) {
      return;
    }

    await record.update((next) => {
      next.name = payload.name;
      next.description = payload.description;
      next.goal = payload.goal;
      next.sourcePlanId = payload.source_plan_id;
      next.isBuiltIn = payload.is_built_in;
      next.isArchived = payload.is_archived;
      next.createdAt = payload.created_at;
      next.updatedAt = payload.updated_at;
    });
    return;
  }

  await database.get<Template>("templates").create((next) => {
    next._raw.id = payload.id;
    next.name = payload.name;
    next.description = payload.description;
    next.goal = payload.goal;
    next.sourcePlanId = payload.source_plan_id;
    next.isBuiltIn = payload.is_built_in;
    next.isArchived = payload.is_archived;
    next.createdAt = payload.created_at;
    next.updatedAt = payload.updated_at;
  });
};

const applyTemplateDayChange = async (
  action: SyncActionType,
  payload: TemplateDaySyncPayload,
): Promise<void> => {
  const record = await findRecordById<TemplateDay>("template_days", payload.id);

  if (action === "delete") {
    if (!isRemoteNewer(record?.updatedAt ?? null, payload.updated_at)) {
      return;
    }

    await removeRemoteDeletedRecord(record);
    return;
  }

  if (record) {
    if (!isRemoteNewer(record.updatedAt, payload.updated_at)) {
      return;
    }

    await record.update((next) => {
      next.templateId = payload.template_id;
      next.name = payload.name;
      next.sortOrder = payload.sort_order;
      next.updatedAt = payload.updated_at;
    });
    return;
  }

  await database.get<TemplateDay>("template_days").create((next) => {
    next._raw.id = payload.id;
    next.templateId = payload.template_id;
    next.name = payload.name;
    next.sortOrder = payload.sort_order;
    next.updatedAt = payload.updated_at;
  });
};

const applyTemplateExerciseChange = async (
  action: SyncActionType,
  payload: TemplateExerciseSyncPayload,
): Promise<void> => {
  const record = await findRecordById<TemplateExercise>("template_exercises", payload.id);

  if (action === "delete") {
    if (!isRemoteNewer(record?.updatedAt ?? null, payload.updated_at)) {
      return;
    }

    await removeRemoteDeletedRecord(record);
    return;
  }

  if (record) {
    if (!isRemoteNewer(record.updatedAt, payload.updated_at)) {
      return;
    }

    await record.update((next) => {
      next.templateDayId = payload.template_day_id;
      next.exerciseId = payload.exercise_id;
      next.targetSets = payload.target_sets;
      next.targetReps = payload.target_reps;
      next.targetWeight = payload.target_weight;
      next.restSeconds = payload.rest_seconds;
      next.supersetGroup = payload.superset_group;
      next.sortOrder = payload.sort_order;
      next.notes = payload.notes;
      next.updatedAt = payload.updated_at;
    });
    return;
  }

  await database.get<TemplateExercise>("template_exercises").create((next) => {
    next._raw.id = payload.id;
    next.templateDayId = payload.template_day_id;
    next.exerciseId = payload.exercise_id;
    next.targetSets = payload.target_sets;
    next.targetReps = payload.target_reps;
    next.targetWeight = payload.target_weight;
    next.restSeconds = payload.rest_seconds;
    next.supersetGroup = payload.superset_group;
    next.sortOrder = payload.sort_order;
    next.notes = payload.notes;
    next.updatedAt = payload.updated_at;
  });
};

const applyRemoteChange = async (change: SyncQueueItem): Promise<void> => {
  switch (change.table) {
    case "challenges":
      await applyChallengeChange(change.action, change.payload as ChallengeSyncPayload);
      return;
    case "exercises":
      await applyExerciseChange(change.action, change.payload as ExerciseSyncPayload);
      return;
    case "plans":
      await applyPlanChange(change.action, change.payload as PlanSyncPayload);
      return;
    case "plan_days":
      await applyPlanDayChange(change.action, change.payload as PlanDaySyncPayload);
      return;
    case "plan_exercises":
      await applyPlanExerciseChange(change.action, change.payload as PlanExerciseSyncPayload);
      return;
    case "workouts":
      await applyWorkoutChange(change.action, change.payload as WorkoutSyncPayload);
      return;
    case "workout_exercises":
      await applyWorkoutExerciseChange(
        change.action,
        change.payload as WorkoutExerciseSyncPayload,
      );
      return;
    case "workout_sets":
      await applyWorkoutSetChange(change.action, change.payload as WorkoutSetSyncPayload);
      return;
    case "personal_records":
      await applyPersonalRecordChange(
        change.action,
        change.payload as PersonalRecordSyncPayload,
      );
      return;
    case "templates":
      await applyTemplateChange(change.action, change.payload as TemplateSyncPayload);
      return;
    case "template_days":
      await applyTemplateDayChange(change.action, change.payload as TemplateDaySyncPayload);
      return;
    case "template_exercises":
      await applyTemplateExerciseChange(
        change.action,
        change.payload as TemplateExerciseSyncPayload,
      );
      return;
    default:
      return;
  }
};

export const serializeChallengeRecord = (record: Challenge): ChallengeSyncPayload => ({
  created_at: record.createdAt,
  current_value: record.currentValue,
  end_date: record.endDate,
  id: record.id,
  is_completed: record.isCompleted,
  start_date: record.startDate,
  target_value: record.targetValue,
  type: record.type,
  updated_at: record.updatedAt,
});

export const serializeExerciseRecord = (record: Exercise): ExerciseSyncPayload => ({
  category: record.category,
  created_at: record.createdAt,
  equipment: record.equipment,
  id: record.id,
  is_archived: record.isArchived,
  is_custom: record.isCustom,
  name: record.name,
  name_en: record.nameEn,
  notes: record.notes,
  primary_muscles: record.primaryMuscles,
  secondary_muscles: record.secondaryMuscles,
  sort_order: record.sortOrder,
  tracking_type: record.trackingType,
  unit_preference: record.unitPreference,
  updated_at: record.updatedAt,
});

export const serializePlanRecord = (record: Plan): PlanSyncPayload => ({
  created_at: record.createdAt,
  description: record.description,
  goal: record.goal,
  id: record.id,
  is_active: record.isActive,
  is_archived: record.isArchived,
  name: record.name,
  updated_at: record.updatedAt,
});

export const serializePlanDayRecord = (record: PlanDay): PlanDaySyncPayload => ({
  id: record.id,
  name: record.name,
  plan_id: record.planId,
  sort_order: record.sortOrder,
  updated_at: record.updatedAt,
});

export const serializePlanExerciseRecord = (
  record: PlanExercise,
): PlanExerciseSyncPayload => ({
  day_id: record.dayId,
  exercise_id: record.exerciseId,
  id: record.id,
  notes: record.notes,
  rest_seconds: record.restSeconds,
  sort_order: record.sortOrder,
  superset_group: record.supersetGroup,
  target_reps: record.targetReps,
  target_sets: record.targetSets,
  target_weight: record.targetWeight,
  updated_at: record.updatedAt,
});

export const serializeWorkoutRecord = (record: Workout): WorkoutSyncPayload => ({
  duration_seconds: record.durationSeconds,
  finished_at: record.finishedAt,
  id: record.id,
  notes: record.notes,
  plan_day_id: record.planDayId,
  rating: record.rating,
  started_at: record.startedAt,
  total_sets: record.totalSets,
  total_volume: record.totalVolume,
  updated_at: record.updatedAt,
});

export const serializeWorkoutExerciseRecord = (
  record: WorkoutExercise,
): WorkoutExerciseSyncPayload => ({
  exercise_id: record.exerciseId,
  id: record.id,
  notes: record.notes,
  sort_order: record.sortOrder,
  updated_at: record.updatedAt,
  volume: record.volume,
  workout_id: record.workoutId,
});

export const serializeWorkoutSetRecord = (record: WorkoutSet): WorkoutSetSyncPayload => ({
  completed_at: record.completedAt,
  distance: record.distance,
  duration_seconds: record.durationSeconds,
  id: record.id,
  is_completed: record.isCompleted,
  is_pr: record.isPr,
  is_warmup: record.isWarmup,
  reps: record.reps,
  rest_seconds: record.restSeconds,
  rpe: record.rpe,
  set_number: record.setNumber,
  unit: record.unit,
  updated_at: record.updatedAt,
  weight: record.weight,
  workout_exercise_id: record.workoutExerciseId,
});

export const serializePersonalRecordRecord = (
  record: PersonalRecord,
): PersonalRecordSyncPayload => ({
  achieved_at: record.achievedAt,
  exercise_id: record.exerciseId,
  id: record.id,
  pr_type: record.prType,
  updated_at: record.updatedAt,
  value: record.value,
  workout_set_id: record.workoutSetId,
});

export const serializeTemplateRecord = (record: Template): TemplateSyncPayload => ({
  created_at: record.createdAt,
  description: record.description,
  goal: record.goal,
  id: record.id,
  is_archived: record.isArchived,
  is_built_in: record.isBuiltIn,
  name: record.name,
  source_plan_id: record.sourcePlanId,
  updated_at: record.updatedAt,
});

export const serializeTemplateDayRecord = (
  record: TemplateDay,
): TemplateDaySyncPayload => ({
  id: record.id,
  name: record.name,
  sort_order: record.sortOrder,
  template_id: record.templateId,
  updated_at: record.updatedAt,
});

export const serializeTemplateExerciseRecord = (
  record: TemplateExercise,
): TemplateExerciseSyncPayload => ({
  exercise_id: record.exerciseId,
  id: record.id,
  notes: record.notes,
  rest_seconds: record.restSeconds,
  sort_order: record.sortOrder,
  superset_group: record.supersetGroup,
  target_reps: record.targetReps,
  target_sets: record.targetSets,
  target_weight: record.targetWeight,
  template_day_id: record.templateDayId,
  updated_at: record.updatedAt,
});

export const queueSyncChange = async <T extends SyncTableName>(
  input: QueueSyncChangeInput<T>,
): Promise<void> => {
  await database.get<SyncQueue>("sync_queue").create((record) => {
    record.tableName = input.table;
    record.recordId = input.recordId;
    record.actionType = input.action;
    record.payload = JSON.stringify(input.payload);
    record.createdAt = Date.now();
  });
};

export const getSyncStatus = async (): Promise<SyncStatus> => {
  const [pendingEntries, lastSyncAt] = await Promise.all([
    database.get<SyncQueue>("sync_queue").query().fetchCount(),
    getLastSyncAt(),
  ]);

  return {
    lastSyncAt,
    pendingCount: pendingEntries,
  };
};

export const clearSyncMetadata = async (): Promise<void> => {
  await setLastSyncAt(null);
};

export const pushChanges = async (): Promise<number> => {
  if (!useAuthStore.getState().accessToken) {
    return 0;
  }

  const queueEntries = await database
    .get<SyncQueue>("sync_queue")
    .query(Q.sortBy("created_at", Q.asc))
    .fetch();

  if (queueEntries.length === 0) {
    return 0;
  }

  const payload = queueEntries.map((entry) => ({
    action: entry.actionType as SyncActionType,
    created_at: entry.createdAt,
    id: entry.id,
    payload: parseQueuePayload(entry),
    record_id: entry.recordId,
    table: entry.tableName as SyncTableName,
  }));

  payload.sort((left, right) => getRemoteChangePriority(left) - getRemoteChangePriority(right));

  const response = await api.post(WORKOUTS.SYNC, {
    changes: payload,
  });

  const data = extractApiData<SyncPushResponse>(response);

  await database.write(async () => {
    for (const entry of queueEntries) {
      await entry.markAsDeleted();
    }
  });

  if (typeof data.last_sync_at === "number") {
    await setLastSyncAt(data.last_sync_at);
  }

  return payload.length;
};

export const pullChanges = async (lastSyncAt?: number | null): Promise<number> => {
  if (!useAuthStore.getState().accessToken) {
    return 0;
  }

  const response = await api.get(WORKOUTS.SYNC, {
    params:
      lastSyncAt === null || lastSyncAt === undefined
        ? undefined
        : { last_sync_at: lastSyncAt },
  });

  const data = extractApiData<SyncPullResponse>(response);
  const changes = [...(data.changes ?? [])].sort(
    (left, right) => getRemoteChangePriority(left) - getRemoteChangePriority(right),
  );

  if (changes.length > 0) {
    await database.write(async () => {
      for (const change of changes) {
        await applyRemoteChange(change);
      }
    });
  }

  await setLastSyncAt(typeof data.last_sync_at === "number" ? data.last_sync_at : Date.now());

  return changes.length;
};

export const resolveConflict = <T extends { updated_at: number }>(
  local: T,
  remote: T,
): T => (remote.updated_at >= local.updated_at ? remote : local);

export const fullSync = async (): Promise<SyncResult> => {
  if (syncPromise) {
    return syncPromise;
  }

  syncPromise = (async () => {
    if (!useAuthStore.getState().accessToken) {
      return {
        lastSyncAt: await getLastSyncAt(),
        pulled: 0,
        pushed: 0,
      };
    }

    if (!(await isOnline())) {
      return {
        lastSyncAt: await getLastSyncAt(),
        pulled: 0,
        pushed: 0,
      };
    }

    const previousLastSyncAt = await getLastSyncAt();
    const pushed = await pushChanges();
    const pulled = await pullChanges(previousLastSyncAt);
    const lastSyncAt = await getLastSyncAt();

    return {
      lastSyncAt,
      pulled,
      pushed,
    };
  })().finally(() => {
    syncPromise = null;
  });

  return syncPromise;
};

export const requestSync = async (): Promise<SyncResult> => fullSync();

export const registerAutomaticSync = (): (() => void) => {
  if (!appStateSubscription) {
    let currentAppState = AppState.currentState;

    appStateSubscription = AppState.addEventListener("change", (nextState) => {
      const resumedFromBackground =
        currentAppState !== "active" && nextState === "active";
      currentAppState = nextState;

      if (resumedFromBackground) {
        void requestSync();
      }
    });
  }

  if (!stopNetInfoSubscription) {
    let wasConnected = true;

    stopNetInfoSubscription = NetInfo.addEventListener((state) => {
      const isConnected = state.isConnected === true && state.isInternetReachable !== false;
      if (!wasConnected && isConnected) {
        void requestSync();
      }
      wasConnected = isConnected;
    });
  }

  return () => {
    appStateSubscription?.remove();
    appStateSubscription = null;

    stopNetInfoSubscription?.();
    stopNetInfoSubscription = null;
  };
};
