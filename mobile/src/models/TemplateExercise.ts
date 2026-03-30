import { Model } from "@nozbe/watermelondb";
import type { Relation } from "@nozbe/watermelondb";
import type { Associations } from "@nozbe/watermelondb/Model";
import { field, immutableRelation } from "@nozbe/watermelondb/decorators";

import type { Exercise } from "./Exercise";
import type { TemplateDay } from "./TemplateDay";

export class TemplateExercise extends Model {
  static table = "template_exercises";

  static associations: Associations = {
    exercises: { type: "belongs_to", key: "exercise_id" },
    template_days: { type: "belongs_to", key: "template_day_id" },
  };

  @field("template_day_id") templateDayId!: string;
  @field("exercise_id") exerciseId!: string;
  @field("target_sets") targetSets!: number;
  @field("target_reps") targetReps!: string | null;
  @field("target_weight") targetWeight!: number | null;
  @field("rest_seconds") restSeconds!: number | null;
  @field("superset_group") supersetGroup!: number | null;
  @field("sort_order") sortOrder!: number;
  @field("notes") notes!: string | null;
  @field("updated_at") updatedAt!: number;

  @immutableRelation("template_days", "template_day_id") day!: Relation<TemplateDay>;
  @immutableRelation("exercises", "exercise_id") exercise!: Relation<Exercise>;
}
