import { Model } from "@nozbe/watermelondb";
import type { Query } from "@nozbe/watermelondb";
import type { Associations } from "@nozbe/watermelondb/Model";
import { children, field } from "@nozbe/watermelondb/decorators";

import type { PlanGoal } from "../constants/enums";
import type { PlanDay } from "./PlanDay";

export class Plan extends Model {
  static table = "plans";

  static associations: Associations = {
    plan_days: { type: "has_many", foreignKey: "plan_id" },
  };

  @field("name") name!: string;
  @field("description") description!: string | null;
  @field("goal") goal!: PlanGoal | null;
  @field("is_active") isActive!: boolean;
  @field("is_archived") isArchived!: boolean;
  @field("created_at") createdAt!: number;
  @field("updated_at") updatedAt!: number;

  @children("plan_days") days!: Query<PlanDay>;
}
