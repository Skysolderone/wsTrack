import { Model } from "@nozbe/watermelondb";
import type { Relation } from "@nozbe/watermelondb";
import type { Associations } from "@nozbe/watermelondb/Model";
import { field, immutableRelation } from "@nozbe/watermelondb/decorators";

import type { WorkoutSet } from "./WorkoutSet";

export class WorkoutVideo extends Model {
  static table = "workout_videos";

  static associations: Associations = {
    workout_sets: { type: "belongs_to", key: "workout_set_id" },
  };

  @field("workout_set_id") workoutSetId!: string;
  @field("file_path") filePath!: string;
  @field("cloud_url") cloudUrl!: string | null;
  @field("duration_seconds") durationSeconds!: number;
  @field("file_size_bytes") fileSizeBytes!: number;
  @field("created_at") createdAt!: number;

  @immutableRelation("workout_sets", "workout_set_id") workoutSet!: Relation<WorkoutSet>;
}
