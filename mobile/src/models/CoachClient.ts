import { Model } from "@nozbe/watermelondb";
import { field } from "@nozbe/watermelondb/decorators";

import type { CoachClientStatus } from "../constants/enums";

export class CoachClient extends Model {
  static table = "coach_clients";

  @field("coach_id") coachId!: string;
  @field("client_id") clientId!: string;
  @field("status") status!: CoachClientStatus;
  @field("notes") notes!: string | null;
  @field("created_at") createdAt!: number;
}
