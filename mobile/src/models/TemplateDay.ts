import { Model } from "@nozbe/watermelondb";
import type { Query, Relation } from "@nozbe/watermelondb";
import type { Associations } from "@nozbe/watermelondb/Model";
import { children, field, immutableRelation } from "@nozbe/watermelondb/decorators";

import type { Template } from "./Template";
import type { TemplateExercise } from "./TemplateExercise";

export class TemplateDay extends Model {
  static table = "template_days";

  static associations: Associations = {
    template_exercises: { type: "has_many", foreignKey: "template_day_id" },
    templates: { type: "belongs_to", key: "template_id" },
  };

  @field("template_id") templateId!: string;
  @field("name") name!: string;
  @field("sort_order") sortOrder!: number;
  @field("updated_at") updatedAt!: number;

  @immutableRelation("templates", "template_id") template!: Relation<Template>;
  @children("template_exercises") exercises!: Query<TemplateExercise>;
}
