import { Model } from "@nozbe/watermelondb";
import type { Query } from "@nozbe/watermelondb";
import type { Associations } from "@nozbe/watermelondb/Model";
import { children, field } from "@nozbe/watermelondb/decorators";

import type { PlanGoal } from "../constants/enums";
import type { TemplateDay } from "./TemplateDay";

export class Template extends Model {
  static table = "templates";

  static associations: Associations = {
    template_days: { type: "has_many", foreignKey: "template_id" },
  };

  @field("name") name!: string;
  @field("description") description!: string | null;
  @field("goal") goal!: PlanGoal | null;
  @field("source_plan_id") sourcePlanId!: string | null;
  @field("is_built_in") isBuiltIn!: boolean;
  @field("is_archived") isArchived!: boolean;
  @field("created_at") createdAt!: number;
  @field("updated_at") updatedAt!: number;

  @children("template_days") days!: Query<TemplateDay>;
}
