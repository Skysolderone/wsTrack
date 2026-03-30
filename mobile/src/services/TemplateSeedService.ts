import type { Database } from "@nozbe/watermelondb";
import { Q } from "@nozbe/watermelondb";

import templatesSeedJson from "../assets/templates-seed.json";
import type { PlanGoal } from "../constants/enums";
import { Exercise, Template, TemplateDay, TemplateExercise } from "../models";

interface TemplateSeedExercise {
  exercise_name_en: string;
  notes?: string | null;
  rest_seconds?: number | null;
  target_reps?: string | null;
  target_sets: number;
  target_weight?: number | null;
}

interface TemplateSeedDay {
  exercises: TemplateSeedExercise[];
  name: string;
}

interface TemplateSeedRecord {
  days: TemplateSeedDay[];
  description?: string | null;
  goal?: PlanGoal | null;
  name: string;
}

const templateSeedRecords = templatesSeedJson as ReadonlyArray<TemplateSeedRecord>;

let seedPromise: Promise<void> | null = null;

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

export const ensureTemplateSeeded = (database: Database): Promise<void> => {
  if (!seedPromise) {
    seedPromise = seedTemplates(database).catch((error: unknown) => {
      seedPromise = null;
      throw error;
    });
  }

  return seedPromise;
};

const seedTemplates = async (database: Database): Promise<void> => {
  const templateCollection = database.get<Template>("templates");
  const builtInCount = await templateCollection
    .query(Q.where("is_built_in", true), Q.where("is_archived", false))
    .fetchCount();

  if (builtInCount > 0) {
    return;
  }

  const exercises = await database
    .get<Exercise>("exercises")
    .query(Q.where("is_archived", false))
    .fetch();
  const lookup = buildExerciseLookup(exercises);
  const timestamp = Date.now();
  const templateDayCollection = database.get<TemplateDay>("template_days");
  const templateExerciseCollection = database.get<TemplateExercise>("template_exercises");

  await database.write(async () => {
    for (const templateSeed of templateSeedRecords) {
      const template = await templateCollection.create((record) => {
        record.name = templateSeed.name;
        record.description = templateSeed.description ?? null;
        record.goal = templateSeed.goal ?? null;
        record.sourcePlanId = null;
        record.isBuiltIn = true;
        record.isArchived = false;
        record.createdAt = timestamp;
        record.updatedAt = timestamp;
      });

      for (const [dayIndex, daySeed] of templateSeed.days.entries()) {
        const day = await templateDayCollection.create((record) => {
          record.templateId = template.id;
          record.name = daySeed.name;
          record.sortOrder = dayIndex;
          record.updatedAt = timestamp;
        });

        for (const [exerciseIndex, exerciseSeed] of daySeed.exercises.entries()) {
          const exercise = lookup.get(exerciseSeed.exercise_name_en);
          if (!exercise) {
            throw new Error(`Template seed exercise not found: ${exerciseSeed.exercise_name_en}`);
          }

          await templateExerciseCollection.create((record) => {
            record.templateDayId = day.id;
            record.exerciseId = exercise.id;
            record.targetSets = exerciseSeed.target_sets;
            record.targetReps = exerciseSeed.target_reps ?? null;
            record.targetWeight = exerciseSeed.target_weight ?? null;
            record.restSeconds = exerciseSeed.rest_seconds ?? 90;
            record.supersetGroup = null;
            record.sortOrder = exerciseIndex;
            record.notes = exerciseSeed.notes ?? null;
            record.updatedAt = timestamp;
          });
        }
      }
    }
  });
};
