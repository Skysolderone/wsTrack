import { Model } from "@nozbe/watermelondb";
import type { Relation } from "@nozbe/watermelondb";
import type { Associations } from "@nozbe/watermelondb/Model";
import { field, immutableRelation } from "@nozbe/watermelondb/decorators";

import type { Workout } from "./Workout";

export class WorkoutComment extends Model {
  static table = "workout_comments";

  static associations: Associations = {
    workouts: { type: "belongs_to", key: "workout_id" },
  };

  @field("coach_id") coachId!: string;
  @field("workout_id") workoutId!: string;
  @field("comment") comment!: string;
  @field("created_at") createdAt!: number;

  @immutableRelation("workouts", "workout_id") workout!: Relation<Workout>;
}
