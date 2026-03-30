import { Model } from "@nozbe/watermelondb";
import type { Query, Relation } from "@nozbe/watermelondb";
import type { Associations } from "@nozbe/watermelondb/Model";
import { children, field, immutableRelation } from "@nozbe/watermelondb/decorators";

import type { WeightUnit } from "../constants/enums";
import type { PersonalRecord } from "./PersonalRecord";
import type { WorkoutExercise } from "./WorkoutExercise";
import type { WorkoutVideo } from "./WorkoutVideo";

export class WorkoutSet extends Model {
  static table = "workout_sets";

  static associations: Associations = {
    personal_records: { type: "has_many", foreignKey: "workout_set_id" },
    workout_exercises: { type: "belongs_to", key: "workout_exercise_id" },
    workout_videos: { type: "has_many", foreignKey: "workout_set_id" },
  };

  @field("workout_exercise_id") workoutExerciseId!: string;
  @field("set_number") setNumber!: number;
  @field("weight") weight!: number | null;
  @field("reps") reps!: number | null;
  @field("duration_seconds") durationSeconds!: number | null;
  @field("distance") distance!: number | null;
  @field("rpe") rpe!: number | null;
  @field("is_warmup") isWarmup!: boolean;
  @field("is_completed") isCompleted!: boolean;
  @field("rest_seconds") restSeconds!: number | null;
  @field("is_pr") isPr!: boolean;
  @field("unit") unit!: WeightUnit;
  @field("completed_at") completedAt!: number | null;
  @field("updated_at") updatedAt!: number;

  @immutableRelation("workout_exercises", "workout_exercise_id")
  workoutExercise!: Relation<WorkoutExercise>;
  @children("personal_records") personalRecords!: Query<PersonalRecord>;
  @children("workout_videos") videos!: Query<WorkoutVideo>;
}
