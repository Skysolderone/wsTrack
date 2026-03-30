import type { Database } from "@nozbe/watermelondb";
import { Q } from "@nozbe/watermelondb";

import exercisesSeedJson from "../assets/exercises-seed.json";
import type {
  Equipment,
  ExerciseCategory,
  MuscleGroup,
  TrackingType,
} from "../constants/enums";
import { Exercise } from "../models";

interface SeedExerciseRecord {
  name: string;
  name_en: string;
  category: ExerciseCategory;
  primary_muscles: MuscleGroup[];
  secondary_muscles: MuscleGroup[];
  equipment: Equipment;
  tracking_type: TrackingType;
}

const BATCH_SIZE = 40;
const exercisesSeed = exercisesSeedJson as ReadonlyArray<SeedExerciseRecord>;

let seedPromise: Promise<void> | null = null;

export const ensureExerciseSeeded = (database: Database): Promise<void> => {
  if (!seedPromise) {
    seedPromise = seedExercises(database).catch((error: unknown) => {
      seedPromise = null;
      throw error;
    });
  }

  return seedPromise;
};

const seedExercises = async (database: Database): Promise<void> => {
  const exercisesCollection = database.get<Exercise>("exercises");
  const presetCount = await exercisesCollection
    .query(Q.where("is_custom", false))
    .fetchCount();

  if (presetCount > 0) {
    return;
  }

  const createdAt = Date.now();

  for (let index = 0; index < exercisesSeed.length; index += BATCH_SIZE) {
    const chunk = exercisesSeed.slice(index, index + BATCH_SIZE);

    await database.write(async () => {
      const operations = chunk.map((record, chunkIndex) =>
        exercisesCollection.prepareCreate((exercise) => {
          exercise.name = record.name;
          exercise.nameEn = record.name_en;
          exercise.category = record.category;
          exercise.primaryMuscles = record.primary_muscles;
          exercise.secondaryMuscles = record.secondary_muscles;
          exercise.equipment = record.equipment;
          exercise.trackingType = record.tracking_type;
          exercise.unitPreference = null;
          exercise.isCustom = false;
          exercise.isArchived = false;
          exercise.notes = null;
          exercise.sortOrder = index + chunkIndex + 1;
          exercise.createdAt = createdAt;
          exercise.updatedAt = createdAt;
        }),
      );

      await database.batch(...operations);
    });
  }
};
