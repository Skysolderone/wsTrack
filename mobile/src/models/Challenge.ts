import { Model } from "@nozbe/watermelondb";
import { field } from "@nozbe/watermelondb/decorators";

import type { ChallengeType } from "../constants/enums";

export class Challenge extends Model {
  static table = "challenges";

  @field("type") type!: ChallengeType;
  @field("target_value") targetValue!: number;
  @field("current_value") currentValue!: number;
  @field("start_date") startDate!: number;
  @field("end_date") endDate!: number;
  @field("is_completed") isCompleted!: boolean;
  @field("created_at") createdAt!: number;
  @field("updated_at") updatedAt!: number;
}
