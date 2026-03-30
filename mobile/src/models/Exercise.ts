import { Model } from "@nozbe/watermelondb";
import type { Query } from "@nozbe/watermelondb";
import type { Associations } from "@nozbe/watermelondb/Model";
import { children, field, json } from "@nozbe/watermelondb/decorators";

import type {
  Equipment,
  ExerciseCategory,
  MuscleGroup,
  TrackingType,
  WeightUnit,
} from "../constants/enums";
import { sanitizeMuscleGroups } from "./sanitizers";
import type { PersonalRecord } from "./PersonalRecord";
import type { PlanExercise } from "./PlanExercise";
import type { TemplateExercise } from "./TemplateExercise";
import type { WorkoutExercise } from "./WorkoutExercise";

export class Exercise extends Model {
  static table = "exercises";

  static associations: Associations = {
    plan_exercises: { type: "has_many", foreignKey: "exercise_id" },
    personal_records: { type: "has_many", foreignKey: "exercise_id" },
    template_exercises: { type: "has_many", foreignKey: "exercise_id" },
    workout_exercises: { type: "has_many", foreignKey: "exercise_id" },
  };

  @field("name") name!: string;
  @field("name_en") nameEn!: string | null;
  @field("category") category!: ExerciseCategory;
  @json("primary_muscles", sanitizeMuscleGroups) primaryMuscles!: MuscleGroup[];
  @json("secondary_muscles", sanitizeMuscleGroups) secondaryMuscles!: MuscleGroup[];
  @field("equipment") equipment!: Equipment;
  @field("tracking_type") trackingType!: TrackingType;
  @field("unit_preference") unitPreference!: WeightUnit | null;
  @field("is_custom") isCustom!: boolean;
  @field("is_archived") isArchived!: boolean;
  @field("notes") notes!: string | null;
  @field("sort_order") sortOrder!: number;
  @field("created_at") createdAt!: number;
  @field("updated_at") updatedAt!: number;

  @children("plan_exercises") planExercises!: Query<PlanExercise>;
  @children("personal_records") personalRecords!: Query<PersonalRecord>;
  @children("template_exercises") templateExercises!: Query<TemplateExercise>;
  @children("workout_exercises") workoutExercises!: Query<WorkoutExercise>;
}
