import { Model } from "@nozbe/watermelondb";
import type { Query, Relation } from "@nozbe/watermelondb";
import type { Associations } from "@nozbe/watermelondb/Model";
import { children, field, immutableRelation } from "@nozbe/watermelondb/decorators";

import type { Plan } from "./Plan";
import type { PlanExercise } from "./PlanExercise";
import type { Workout } from "./Workout";

export class PlanDay extends Model {
  static table = "plan_days";

  static associations: Associations = {
    plans: { type: "belongs_to", key: "plan_id" },
    plan_exercises: { type: "has_many", foreignKey: "day_id" },
    workouts: { type: "has_many", foreignKey: "plan_day_id" },
  };

  @field("plan_id") planId!: string;
  @field("name") name!: string;
  @field("sort_order") sortOrder!: number;
  @field("updated_at") updatedAt!: number;

  @immutableRelation("plans", "plan_id") plan!: Relation<Plan>;
  @children("plan_exercises") exercises!: Query<PlanExercise>;
  @children("workouts") workouts!: Query<Workout>;
}
