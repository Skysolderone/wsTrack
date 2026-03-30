import { Model } from "@nozbe/watermelondb";
import type { Query, Relation } from "@nozbe/watermelondb";
import type { Associations } from "@nozbe/watermelondb/Model";
import { children, field, immutableRelation } from "@nozbe/watermelondb/decorators";

import type { Exercise } from "./Exercise";
import type { Workout } from "./Workout";
import type { WorkoutSet } from "./WorkoutSet";

export class WorkoutExercise extends Model {
  static table = "workout_exercises";

  static associations: Associations = {
    workouts: { type: "belongs_to", key: "workout_id" },
    exercises: { type: "belongs_to", key: "exercise_id" },
    workout_sets: { type: "has_many", foreignKey: "workout_exercise_id" },
  };

  @field("workout_id") workoutId!: string;
  @field("exercise_id") exerciseId!: string;
  @field("sort_order") sortOrder!: number;
  @field("volume") volume!: number;
  @field("notes") notes!: string | null;
  @field("updated_at") updatedAt!: number;

  @immutableRelation("workouts", "workout_id") workout!: Relation<Workout>;
  @immutableRelation("exercises", "exercise_id") exercise!: Relation<Exercise>;
  @children("workout_sets") sets!: Query<WorkoutSet>;
}
