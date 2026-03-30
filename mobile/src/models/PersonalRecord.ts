import { Model } from "@nozbe/watermelondb";
import type { Relation } from "@nozbe/watermelondb";
import type { Associations } from "@nozbe/watermelondb/Model";
import { field, immutableRelation } from "@nozbe/watermelondb/decorators";

import type { PRType } from "../constants/enums";
import type { Exercise } from "./Exercise";
import type { WorkoutSet } from "./WorkoutSet";

export class PersonalRecord extends Model {
  static table = "personal_records";

  static associations: Associations = {
    exercises: { type: "belongs_to", key: "exercise_id" },
    workout_sets: { type: "belongs_to", key: "workout_set_id" },
  };

  @field("exercise_id") exerciseId!: string;
  @field("pr_type") prType!: PRType;
  @field("value") value!: number;
  @field("workout_set_id") workoutSetId!: string;
  @field("achieved_at") achievedAt!: number;
  @field("updated_at") updatedAt!: number;

  @immutableRelation("exercises", "exercise_id") exercise!: Relation<Exercise>;
  @immutableRelation("workout_sets", "workout_set_id") workoutSet!: Relation<WorkoutSet>;
}
