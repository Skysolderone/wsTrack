import { Q } from "@nozbe/watermelondb";

import { PlanGoal } from "../constants/enums";
import { database } from "../database";
import { Exercise, Plan, PlanDay, PlanExercise } from "../models";
import {
  queueSyncChange,
  serializePlanDayRecord,
  serializePlanExerciseRecord,
  serializePlanRecord,
} from "./SyncService";

export interface PlanSummary {
  dayCount: number;
  goal: PlanGoal | null;
  id: string;
  isActive: boolean;
  lastUsedAt: number | null;
  name: string;
}

export interface PlanExerciseItem {
  exercise: Exercise;
  exerciseId: string;
  id: string;
  notes: string | null;
  restSeconds: number | null;
  sortOrder: number;
  targetReps: string | null;
  targetSets: number;
  targetWeight: number | null;
}

export interface PlanDayItem {
  exercises: PlanExerciseItem[];
  id: string;
  name: string;
  sortOrder: number;
}

export interface PlanEditorData {
  days: PlanDayItem[];
  goal: PlanGoal | null;
  id: string;
  isActive: boolean;
  name: string;
}

export interface PlanExerciseUpdates {
  notes?: string | null;
  restSeconds?: number | null;
  targetReps?: string | null;
  targetSets?: number;
  targetWeight?: number | null;
}

export const loadPlanSummaries = async (): Promise<PlanSummary[]> => {
  const plans = await database
    .get<Plan>("plans")
    .query(Q.where("is_archived", false), Q.sortBy("updated_at", Q.desc))
    .fetch();

  const summaries = await Promise.all(
    plans.map(async (plan) => {
      const days = await plan.days.fetch();
      const lastUsedAt = await resolvePlanLastUsedAt(days);

      return {
        dayCount: days.length,
        goal: plan.goal,
        id: plan.id,
        isActive: plan.isActive,
        lastUsedAt,
        name: plan.name,
      };
    }),
  );

  return summaries.sort((left, right) => {
    if (left.isActive && !right.isActive) {
      return -1;
    }

    if (!left.isActive && right.isActive) {
      return 1;
    }

    return left.name.localeCompare(right.name, "zh-CN");
  });
};

export const loadPlanEditorData = async (planId: string): Promise<PlanEditorData> => {
  const plan = await database.get<Plan>("plans").find(planId);
  const days = await plan.days.fetch();

  const orderedDays = [...days].sort((left, right) => left.sortOrder - right.sortOrder);

  const dayItems = await Promise.all(
    orderedDays.map(async (day) => {
      const exercises = await day.exercises.fetch();
      const orderedExercises = [...exercises].sort(
        (left, right) => left.sortOrder - right.sortOrder,
      );

      const exerciseItems = await Promise.all(
        orderedExercises.map(async (planExercise) => ({
          exercise: await planExercise.exercise.fetch(),
          exerciseId: planExercise.exerciseId,
          id: planExercise.id,
          notes: planExercise.notes,
          restSeconds: planExercise.restSeconds,
          sortOrder: planExercise.sortOrder,
          targetReps: planExercise.targetReps,
          targetSets: planExercise.targetSets,
          targetWeight: planExercise.targetWeight,
        })),
      );

      return {
        exercises: exerciseItems,
        id: day.id,
        name: day.name,
        sortOrder: day.sortOrder,
      };
    }),
  );

  return {
    days: dayItems,
    goal: plan.goal,
    id: plan.id,
    isActive: plan.isActive,
    name: plan.name,
  };
};

export const createPlan = async (
  name: string,
  goal: PlanGoal,
): Promise<string> => {
  const plansCollection = database.get<Plan>("plans");
  const timestamp = Date.now();
  let createdPlanId = "";

  await database.write(async () => {
    const plan = await plansCollection.create((record) => {
      record.name = name.trim() || "未命名计划";
      record.description = null;
      record.goal = goal;
      record.isActive = false;
      record.isArchived = false;
      record.createdAt = timestamp;
      record.updatedAt = timestamp;
    });

    await queueSyncChange({
      action: "create",
      payload: serializePlanRecord(plan),
      recordId: plan.id,
      table: "plans",
    });

    createdPlanId = plan.id;
  });

  return createdPlanId;
};

export const updatePlan = async (
  planId: string,
  updates: {
    goal?: PlanGoal | null;
    name?: string;
  },
): Promise<void> => {
  const plan = await database.get<Plan>("plans").find(planId);

  await database.write(async () => {
    const updatedAt = Date.now();
    await plan.update((record) => {
      if (updates.name !== undefined) {
        record.name = updates.name.trim() || "未命名计划";
      }

      if (updates.goal !== undefined) {
        record.goal = updates.goal;
      }

      record.updatedAt = updatedAt;
    });

    await queueSyncChange({
      action: "update",
      payload: serializePlanRecord(plan),
      recordId: plan.id,
      table: "plans",
    });
  });
};

export const addDayToPlan = async (
  planId: string,
  name: string,
): Promise<string> => {
  const planDaysCollection = database.get<PlanDay>("plan_days");
  const timestamp = Date.now();
  const existingDays = await database
    .get<PlanDay>("plan_days")
    .query(Q.where("plan_id", planId), Q.sortBy("sort_order", Q.desc))
    .fetch();
  const nextSortOrder = (existingDays[0]?.sortOrder ?? -1) + 1;
  let createdDayId = "";

  await database.write(async () => {
    const day = await planDaysCollection.create((record) => {
      record.planId = planId;
      record.name = name.trim() || `Day ${nextSortOrder + 1}`;
      record.sortOrder = nextSortOrder;
      record.updatedAt = timestamp;
    });

    await queueSyncChange({
      action: "create",
      payload: serializePlanDayRecord(day),
      recordId: day.id,
      table: "plan_days",
    });

    createdDayId = day.id;
  });

  await touchPlan(planId);

  return createdDayId;
};

export const renameDay = async (dayId: string, name: string): Promise<void> => {
  const day = await database.get<PlanDay>("plan_days").find(dayId);

  await database.write(async () => {
    const updatedAt = Date.now();
    await day.update((record) => {
      record.name = name.trim() || record.name;
      record.updatedAt = updatedAt;
    });

    await queueSyncChange({
      action: "update",
      payload: serializePlanDayRecord(day),
      recordId: day.id,
      table: "plan_days",
    });
  });

  await touchPlan(day.planId);
};

export const deleteDay = async (dayId: string): Promise<void> => {
  const day = await database.get<PlanDay>("plan_days").find(dayId);
  const exercises = await day.exercises.fetch();
  const planId = day.planId;

  await database.write(async () => {
    const deletedAt = Date.now();
    for (const exercise of exercises) {
      const payload = {
        ...serializePlanExerciseRecord(exercise),
        updated_at: deletedAt,
      };
      await exercise.markAsDeleted();
      await queueSyncChange({
        action: "delete",
        payload,
        recordId: exercise.id,
        table: "plan_exercises",
      });
    }

    const dayPayload = {
      ...serializePlanDayRecord(day),
      updated_at: deletedAt,
    };
    await day.markAsDeleted();
    await queueSyncChange({
      action: "delete",
      payload: dayPayload,
      recordId: day.id,
      table: "plan_days",
    });
  });

  await touchPlan(planId);
};

export const addExerciseToDay = async (
  dayId: string,
  exerciseId: string,
  targetSets: number,
): Promise<string> => {
  const exercisesCollection = database.get<PlanExercise>("plan_exercises");
  const timestamp = Date.now();
  const existingExercises = await database
    .get<PlanExercise>("plan_exercises")
    .query(Q.where("day_id", dayId), Q.sortBy("sort_order", Q.desc))
    .fetch();
  const nextSortOrder = (existingExercises[0]?.sortOrder ?? -1) + 1;
  let createdPlanExerciseId = "";

  await database.write(async () => {
    const planExercise = await exercisesCollection.create((record) => {
      record.dayId = dayId;
      record.exerciseId = exerciseId;
      record.targetSets = targetSets;
      record.targetReps = "8-12";
      record.targetWeight = null;
      record.restSeconds = 90;
      record.supersetGroup = null;
      record.sortOrder = nextSortOrder;
      record.notes = null;
      record.updatedAt = timestamp;
    });

    await queueSyncChange({
      action: "create",
      payload: serializePlanExerciseRecord(planExercise),
      recordId: planExercise.id,
      table: "plan_exercises",
    });

    createdPlanExerciseId = planExercise.id;
  });

  const day = await database.get<PlanDay>("plan_days").find(dayId);
  await touchPlan(day.planId);

  return createdPlanExerciseId;
};

export const removePlanExercise = async (id: string): Promise<void> => {
  const planExercise = await database.get<PlanExercise>("plan_exercises").find(id);
  const day = await database.get<PlanDay>("plan_days").find(planExercise.dayId);

  await database.write(async () => {
    const deletedAt = Date.now();
    const payload = {
      ...serializePlanExerciseRecord(planExercise),
      updated_at: deletedAt,
    };
    await planExercise.markAsDeleted();
    await queueSyncChange({
      action: "delete",
      payload,
      recordId: planExercise.id,
      table: "plan_exercises",
    });
  });

  await touchPlan(day.planId);
};

export const updatePlanExercise = async (
  id: string,
  updates: PlanExerciseUpdates,
): Promise<void> => {
  const exercise = await database.get<PlanExercise>("plan_exercises").find(id);
  const day = await database.get<PlanDay>("plan_days").find(exercise.dayId);

  await database.write(async () => {
    const updatedAt = Date.now();
    await exercise.update((record) => {
      if (updates.targetSets !== undefined) {
        record.targetSets = Math.max(1, Math.round(updates.targetSets));
      }

      if (updates.targetReps !== undefined) {
        record.targetReps = updates.targetReps;
      }

      if (updates.restSeconds !== undefined) {
        record.restSeconds = updates.restSeconds;
      }

      if (updates.targetWeight !== undefined) {
        record.targetWeight = updates.targetWeight;
      }

      if (updates.notes !== undefined) {
        record.notes = updates.notes;
      }

      record.updatedAt = updatedAt;
    });

    await queueSyncChange({
      action: "update",
      payload: serializePlanExerciseRecord(exercise),
      recordId: exercise.id,
      table: "plan_exercises",
    });
  });

  await touchPlan(day.planId);
};

export const reorderExercises = async (
  dayId: string,
  orderedIds: string[],
): Promise<void> => {
  const day = await database.get<PlanDay>("plan_days").find(dayId);
  const planExercises = await Promise.all(
    orderedIds.map((id) => database.get<PlanExercise>("plan_exercises").find(id)),
  );

  await database.write(async () => {
    const updatedAt = Date.now();
    for (const [index, planExercise] of planExercises.entries()) {
      await planExercise.update((record) => {
        record.sortOrder = index;
        record.updatedAt = updatedAt;
      });

      await queueSyncChange({
        action: "update",
        payload: serializePlanExerciseRecord(planExercise),
        recordId: planExercise.id,
        table: "plan_exercises",
      });
    }
  });

  await touchPlan(day.planId);
};

export const duplicatePlan = async (planId: string): Promise<string> => {
  const sourcePlan = await loadPlanEditorData(planId);
  const duplicatedPlanId = await createPlan(
    `${sourcePlan.name} 副本`,
    sourcePlan.goal ?? PlanGoal.General,
  );

  for (const day of sourcePlan.days) {
    const newDayId = await addDayToPlan(duplicatedPlanId, day.name);

    for (const exercise of day.exercises) {
      const newPlanExerciseId = await addExerciseToDay(
        newDayId,
        exercise.exerciseId,
        exercise.targetSets,
      );

      await updatePlanExercise(newPlanExerciseId, {
        notes: exercise.notes,
        restSeconds: exercise.restSeconds,
        targetReps: exercise.targetReps,
        targetSets: exercise.targetSets,
        targetWeight: exercise.targetWeight,
      });
    }
  }

  return duplicatedPlanId;
};

export const deletePlan = async (planId: string): Promise<void> => {
  const plan = await database.get<Plan>("plans").find(planId);

  await database.write(async () => {
    const updatedAt = Date.now();
    await plan.update((record) => {
      record.isArchived = true;
      record.isActive = false;
      record.updatedAt = updatedAt;
    });

    await queueSyncChange({
      action: "update",
      payload: serializePlanRecord(plan),
      recordId: plan.id,
      table: "plans",
    });
  });
};

export const archivePlan = async (planId: string): Promise<void> => {
  await deletePlan(planId);
};

export const setActivePlan = async (planId: string): Promise<void> => {
  const plans = await database
    .get<Plan>("plans")
    .query(Q.where("is_archived", false))
    .fetch();

  await database.write(async () => {
    const updatedAt = Date.now();
    for (const plan of plans) {
      await plan.update((record) => {
        record.isActive = plan.id === planId;
        record.updatedAt = updatedAt;
      });

      await queueSyncChange({
        action: "update",
        payload: serializePlanRecord(plan),
        recordId: plan.id,
        table: "plans",
      });
    }
  });
};

const resolvePlanLastUsedAt = async (days: PlanDay[]): Promise<number | null> => {
  const workouts = (
    await Promise.all(days.map((day) => day.workouts.fetch()))
  ).flat();

  if (workouts.length === 0) {
    return null;
  }

  return workouts.reduce((latest, workout) => Math.max(latest, workout.startedAt), 0);
};

const touchPlan = async (planId: string): Promise<void> => {
  const plan = await database.get<Plan>("plans").find(planId);

  await database.write(async () => {
    const updatedAt = Date.now();
    await plan.update((record) => {
      record.updatedAt = updatedAt;
    });

    await queueSyncChange({
      action: "update",
      payload: serializePlanRecord(plan),
      recordId: plan.id,
      table: "plans",
    });
  });
};
