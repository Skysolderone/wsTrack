import { Q } from "@nozbe/watermelondb";

import { PlanGoal } from "../constants/enums";
import { database } from "../database";
import {
  Exercise,
  Plan,
  PlanDay,
  PlanExercise,
  Template,
  TemplateDay,
  TemplateExercise,
} from "../models";
import {
  queueSyncChange,
  serializePlanDayRecord,
  serializePlanExerciseRecord,
  serializePlanRecord,
  serializeTemplateDayRecord,
  serializeTemplateExerciseRecord,
  serializeTemplateRecord,
} from "./SyncService";

export interface TemplateExercisePreview {
  exerciseId: string;
  exerciseName: string;
  id: string;
  notes: string | null;
  restSeconds: number | null;
  sortOrder: number;
  targetReps: string | null;
  targetSets: number;
  targetWeight: number | null;
}

export interface TemplateDayPreview {
  exercises: TemplateExercisePreview[];
  id: string;
  name: string;
  sortOrder: number;
}

export interface TemplatePreview {
  dayCount: number;
  days: TemplateDayPreview[];
  description: string | null;
  goal: PlanGoal | null;
  id: string;
  isBuiltIn: boolean;
  name: string;
  updatedAt: number;
}

interface ImportTemplateExercise {
  exercise_name?: string;
  exercise_name_en?: string;
  notes?: string | null;
  rest_seconds?: number | null;
  target_reps?: string | null;
  target_sets: number;
  target_weight?: number | null;
}

interface ImportTemplateDay {
  exercises: ImportTemplateExercise[];
  name: string;
}

interface ImportTemplatePayload {
  days: ImportTemplateDay[];
  description?: string | null;
  goal?: PlanGoal | null;
  name: string;
}

const buildExerciseLookup = (exercises: Exercise[]): Map<string, Exercise> => {
  const lookup = new Map<string, Exercise>();

  for (const exercise of exercises) {
    lookup.set(exercise.name, exercise);
    if (exercise.nameEn) {
      lookup.set(exercise.nameEn, exercise);
    }
  }

  return lookup;
};

const isPlanGoal = (value: unknown): value is PlanGoal =>
  value === PlanGoal.Endurance ||
  value === PlanGoal.General ||
  value === PlanGoal.Hypertrophy ||
  value === PlanGoal.Strength;

const parseImportPayload = (json: string): ImportTemplatePayload => {
  const parsed = JSON.parse(json) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("模板 JSON 结构无效");
  }

  const payload = parsed as Partial<ImportTemplatePayload>;
  if (typeof payload.name !== "string" || payload.name.trim().length === 0) {
    throw new Error("模板名称不能为空");
  }

  if (!Array.isArray(payload.days) || payload.days.length === 0) {
    throw new Error("模板至少需要一个训练日");
  }

  const normalizedDays = payload.days.map((day) => {
    if (!day || typeof day !== "object" || typeof day.name !== "string") {
      throw new Error("训练日结构无效");
    }

    if (!Array.isArray(day.exercises) || day.exercises.length === 0) {
      throw new Error(`训练日 ${day.name} 至少需要一个动作`);
    }

    return {
      exercises: day.exercises.map((exercise) => {
        if (!exercise || typeof exercise !== "object") {
          throw new Error("动作结构无效");
        }

        if (
          typeof exercise.exercise_name !== "string" &&
          typeof exercise.exercise_name_en !== "string"
        ) {
          throw new Error("动作需要提供 exercise_name 或 exercise_name_en");
        }

        return {
          exercise_name:
            typeof exercise.exercise_name === "string" ? exercise.exercise_name : undefined,
          exercise_name_en:
            typeof exercise.exercise_name_en === "string"
              ? exercise.exercise_name_en
              : undefined,
          notes: typeof exercise.notes === "string" ? exercise.notes : null,
          rest_seconds:
            typeof exercise.rest_seconds === "number" ? exercise.rest_seconds : null,
          target_reps:
            typeof exercise.target_reps === "string" ? exercise.target_reps : null,
          target_sets:
            typeof exercise.target_sets === "number" ? exercise.target_sets : 3,
          target_weight:
            typeof exercise.target_weight === "number" ? exercise.target_weight : null,
        };
      }),
      name: day.name,
    };
  });

  return {
    days: normalizedDays,
    description: typeof payload.description === "string" ? payload.description : null,
    goal: isPlanGoal(payload.goal) ? payload.goal : null,
    name: payload.name.trim(),
  };
};

const loadTemplatePreview = async (template: Template): Promise<TemplatePreview> => {
  const days = (await template.days.fetch()).sort((left, right) => left.sortOrder - right.sortOrder);

  const dayItems = await Promise.all(
    days.map(async (day) => {
      const exercises = (await day.exercises.fetch()).sort(
        (left, right) => left.sortOrder - right.sortOrder,
      );

      const exerciseItems = await Promise.all(
        exercises.map(async (templateExercise) => ({
          exerciseId: templateExercise.exerciseId,
          exerciseName: (await templateExercise.exercise.fetch()).name,
          id: templateExercise.id,
          notes: templateExercise.notes,
          restSeconds: templateExercise.restSeconds,
          sortOrder: templateExercise.sortOrder,
          targetReps: templateExercise.targetReps,
          targetSets: templateExercise.targetSets,
          targetWeight: templateExercise.targetWeight,
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
    dayCount: dayItems.length,
    days: dayItems,
    description: template.description,
    goal: template.goal,
    id: template.id,
    isBuiltIn: template.isBuiltIn,
    name: template.name,
    updatedAt: template.updatedAt,
  };
};

const createTemplateFromPayload = async (input: {
  description: string | null;
  days: Array<{
    exercises: Array<{
      exerciseId: string;
      notes: string | null;
      restSeconds: number | null;
      targetReps: string | null;
      targetSets: number;
      targetWeight: number | null;
    }>;
    name: string;
  }>;
  goal: PlanGoal | null;
  isBuiltIn: boolean;
  name: string;
  sourcePlanId: string | null;
}): Promise<string> => {
  const timestamp = Date.now();
  const templateCollection = database.get<Template>("templates");
  const templateDayCollection = database.get<TemplateDay>("template_days");
  const templateExerciseCollection = database.get<TemplateExercise>("template_exercises");
  let createdTemplateId = "";

  await database.write(async () => {
    const template = await templateCollection.create((record) => {
      record.name = input.name.trim() || "未命名模板";
      record.description = input.description;
      record.goal = input.goal;
      record.sourcePlanId = input.sourcePlanId;
      record.isBuiltIn = input.isBuiltIn;
      record.isArchived = false;
      record.createdAt = timestamp;
      record.updatedAt = timestamp;
    });

    createdTemplateId = template.id;

    for (const [dayIndex, dayInput] of input.days.entries()) {
      const day = await templateDayCollection.create((record) => {
        record.templateId = template.id;
        record.name = dayInput.name.trim() || `Day ${dayIndex + 1}`;
        record.sortOrder = dayIndex;
        record.updatedAt = timestamp;
      });

      await queueSyncChange({
        action: "create",
        payload: serializeTemplateDayRecord(day),
        recordId: day.id,
        table: "template_days",
      });

      for (const [exerciseIndex, exerciseInput] of dayInput.exercises.entries()) {
        const templateExercise = await templateExerciseCollection.create((record) => {
          record.templateDayId = day.id;
          record.exerciseId = exerciseInput.exerciseId;
          record.targetSets = Math.max(1, Math.round(exerciseInput.targetSets));
          record.targetReps = exerciseInput.targetReps;
          record.targetWeight = exerciseInput.targetWeight;
          record.restSeconds = exerciseInput.restSeconds;
          record.supersetGroup = null;
          record.sortOrder = exerciseIndex;
          record.notes = exerciseInput.notes;
          record.updatedAt = timestamp;
        });

        await queueSyncChange({
          action: "create",
          payload: serializeTemplateExerciseRecord(templateExercise),
          recordId: templateExercise.id,
          table: "template_exercises",
        });
      }
    }

    await queueSyncChange({
      action: "create",
      payload: serializeTemplateRecord(template),
      recordId: template.id,
      table: "templates",
    });
  });

  return createdTemplateId;
};

const resolveTemplatePayloadExercises = async (
  payload: ImportTemplatePayload,
): Promise<Array<{
  exercises: Array<{
    exerciseId: string;
    notes: string | null;
    restSeconds: number | null;
    targetReps: string | null;
    targetSets: number;
    targetWeight: number | null;
  }>;
  name: string;
}>> => {
  const exercises = await database
    .get<Exercise>("exercises")
    .query(Q.where("is_archived", false))
    .fetch();
  const lookup = buildExerciseLookup(exercises);

  return payload.days.map((day) => ({
    exercises: day.exercises.map((exercise) => {
      const resolvedExercise =
        (exercise.exercise_name_en ? lookup.get(exercise.exercise_name_en) : undefined) ??
        (exercise.exercise_name ? lookup.get(exercise.exercise_name) : undefined);

      if (!resolvedExercise) {
        throw new Error(
          `无法解析模板动作：${exercise.exercise_name_en ?? exercise.exercise_name ?? "unknown"}`,
        );
      }

      return {
        exerciseId: resolvedExercise.id,
        notes: exercise.notes ?? null,
        restSeconds: exercise.rest_seconds ?? 90,
        targetReps: exercise.target_reps ?? null,
        targetSets: exercise.target_sets,
        targetWeight: exercise.target_weight ?? null,
      };
    }),
    name: day.name,
  }));
};

const cloneTemplateToPlan = async (template: TemplatePreview): Promise<string> => {
  const timestamp = Date.now();
  const planCollection = database.get<Plan>("plans");
  const dayCollection = database.get<PlanDay>("plan_days");
  const planExerciseCollection = database.get<PlanExercise>("plan_exercises");
  let createdPlanId = "";

  await database.write(async () => {
    const plan = await planCollection.create((record) => {
      record.name = template.name;
      record.description = template.description;
      record.goal = template.goal;
      record.isActive = false;
      record.isArchived = false;
      record.createdAt = timestamp;
      record.updatedAt = timestamp;
    });

    createdPlanId = plan.id;

    for (const day of template.days) {
      const planDay = await dayCollection.create((record) => {
        record.planId = plan.id;
        record.name = day.name;
        record.sortOrder = day.sortOrder;
        record.updatedAt = timestamp;
      });

      await queueSyncChange({
        action: "create",
        payload: serializePlanDayRecord(planDay),
        recordId: planDay.id,
        table: "plan_days",
      });

      for (const exercise of day.exercises) {
        const planExercise = await planExerciseCollection.create((record) => {
          record.dayId = planDay.id;
          record.exerciseId = exercise.exerciseId;
          record.targetSets = exercise.targetSets;
          record.targetReps = exercise.targetReps;
          record.targetWeight = exercise.targetWeight;
          record.restSeconds = exercise.restSeconds;
          record.supersetGroup = null;
          record.sortOrder = exercise.sortOrder;
          record.notes = exercise.notes;
          record.updatedAt = timestamp;
        });

        await queueSyncChange({
          action: "create",
          payload: serializePlanExerciseRecord(planExercise),
          recordId: planExercise.id,
          table: "plan_exercises",
        });
      }
    }

    await queueSyncChange({
      action: "create",
      payload: serializePlanRecord(plan),
      recordId: plan.id,
      table: "plans",
    });
  });

  return createdPlanId;
};

export const getBuiltInTemplates = async (): Promise<TemplatePreview[]> => {
  const templates = await database
    .get<Template>("templates")
    .query(
      Q.where("is_built_in", true),
      Q.where("is_archived", false),
      Q.sortBy("updated_at", Q.desc),
    )
    .fetch();

  return Promise.all(templates.map(loadTemplatePreview));
};

export const getUserTemplates = async (): Promise<TemplatePreview[]> => {
  const templates = await database
    .get<Template>("templates")
    .query(
      Q.where("is_built_in", false),
      Q.where("is_archived", false),
      Q.sortBy("updated_at", Q.desc),
    )
    .fetch();

  return Promise.all(templates.map(loadTemplatePreview));
};

export const applyTemplate = async (templateId: string): Promise<string> => {
  const template = await database.get<Template>("templates").find(templateId);
  const preview = await loadTemplatePreview(template);
  return cloneTemplateToPlan(preview);
};

export const saveAsTemplate = async (planId: string, name: string): Promise<string> => {
  const plan = await database.get<Plan>("plans").find(planId);
  const days = (await plan.days.fetch()).sort((left, right) => left.sortOrder - right.sortOrder);

  if (days.length === 0) {
    throw new Error("计划至少需要一个训练日后才能保存为模板");
  }

  const payloadDays = await Promise.all(
    days.map(async (day) => {
      const exercises = (await day.exercises.fetch()).sort(
        (left, right) => left.sortOrder - right.sortOrder,
      );

      return {
        exercises: exercises.map((exercise) => ({
          exerciseId: exercise.exerciseId,
          notes: exercise.notes,
          restSeconds: exercise.restSeconds,
          targetReps: exercise.targetReps,
          targetSets: exercise.targetSets,
          targetWeight: exercise.targetWeight,
        })),
        name: day.name,
      };
    }),
  );

  return createTemplateFromPayload({
    days: payloadDays,
    description: plan.description,
    goal: plan.goal,
    isBuiltIn: false,
    name,
    sourcePlanId: plan.id,
  });
};

export const exportTemplate = async (templateId: string): Promise<string> => {
  const template = await database.get<Template>("templates").find(templateId);
  const preview = await loadTemplatePreview(template);

  const payload = {
    days: await Promise.all(
      preview.days.map(async (day) => ({
        exercises: await Promise.all(
          day.exercises.map(async (exercise) => {
            const resolvedExercise = await database
              .get<Exercise>("exercises")
              .find(exercise.exerciseId);

            return {
              exercise_name: resolvedExercise.name,
              exercise_name_en: resolvedExercise.nameEn,
              notes: exercise.notes,
              rest_seconds: exercise.restSeconds,
              target_reps: exercise.targetReps,
              target_sets: exercise.targetSets,
              target_weight: exercise.targetWeight,
            };
          }),
        ),
        name: day.name,
      })),
    ),
    description: preview.description,
    goal: preview.goal,
    name: preview.name,
  };

  return JSON.stringify(payload, null, 2);
};

export const importTemplate = async (json: string): Promise<string> => {
  const payload = parseImportPayload(json);
  const resolvedDays = await resolveTemplatePayloadExercises(payload);

  return createTemplateFromPayload({
    days: resolvedDays,
    description: payload.description ?? null,
    goal: payload.goal ?? null,
    isBuiltIn: false,
    name: payload.name,
    sourcePlanId: null,
  });
};
