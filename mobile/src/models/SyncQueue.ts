import { Model } from "@nozbe/watermelondb";
import { field } from "@nozbe/watermelondb/decorators";

export class SyncQueue extends Model {
  static table = "sync_queue";

  @field("table_name") tableName!: string;
  @field("record_id") recordId!: string;
  @field("action_type") actionType!: string;
  @field("payload") payload!: string;
  @field("created_at") createdAt!: number;
}
