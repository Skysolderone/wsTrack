import { Model } from "@nozbe/watermelondb";
import type { Query, Relation } from "@nozbe/watermelondb";
import type { Associations } from "@nozbe/watermelondb/Model";
import { children, field, relation } from "@nozbe/watermelondb/decorators";

import type { PlanDay } from "./PlanDay";
import type { WorkoutComment } from "./WorkoutComment";
import type { WorkoutExercise } from "./WorkoutExercise";

export class Workout extends Model {
  static table = "workouts";

  static associations: Associations = {
    plan_days: { type: "belongs_to", key: "plan_day_id" },
    workout_comments: { type: "has_many", foreignKey: "workout_id" },
    workout_exercises: { type: "has_many", foreignKey: "workout_id" },
  };

  @field("plan_day_id") planDayId!: string | null;
  @field("started_at") startedAt!: number;
  @field("finished_at") finishedAt!: number | null;
  @field("duration_seconds") durationSeconds!: number;
  @field("total_volume") totalVolume!: number;
  @field("total_sets") totalSets!: number;
  @field("rating") rating!: number | null;
  @field("notes") notes!: string | null;
  @field("updated_at") updatedAt!: number;

  @relation("plan_days", "plan_day_id") planDay!: Relation<PlanDay>;
  @children("workout_comments") comments!: Query<WorkoutComment>;
  @children("workout_exercises") exercises!: Query<WorkoutExercise>;
}
