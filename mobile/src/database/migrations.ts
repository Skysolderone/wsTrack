import {
  addColumns,
  createTable,
  schemaMigrations,
} from "@nozbe/watermelondb/Schema/migrations";

const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        addColumns({
          columns: [{ name: "is_archived", type: "boolean" }],
          table: "plans",
        }),
      ],
    },
    {
      toVersion: 3,
      steps: [
        createTable({
          name: "personal_records",
          columns: [
            { name: "exercise_id", type: "string", isIndexed: true },
            { name: "pr_type", type: "string", isIndexed: true },
            { name: "value", type: "number" },
            { name: "workout_set_id", type: "string", isIndexed: true },
            { name: "achieved_at", type: "number", isIndexed: true },
          ],
        }),
      ],
    },
    {
      toVersion: 4,
      steps: [
        createTable({
          name: "templates",
          columns: [
            { name: "name", type: "string" },
            { name: "description", type: "string", isOptional: true },
            { name: "goal", type: "string", isOptional: true },
            { name: "source_plan_id", type: "string", isOptional: true },
            { name: "is_built_in", type: "boolean" },
            { name: "is_archived", type: "boolean" },
            { name: "created_at", type: "number" },
            { name: "updated_at", type: "number" },
          ],
        }),
        createTable({
          name: "template_days",
          columns: [
            { name: "template_id", type: "string", isIndexed: true },
            { name: "name", type: "string" },
            { name: "sort_order", type: "number" },
          ],
        }),
        createTable({
          name: "template_exercises",
          columns: [
            { name: "template_day_id", type: "string", isIndexed: true },
            { name: "exercise_id", type: "string", isIndexed: true },
            { name: "target_sets", type: "number" },
            { name: "target_reps", type: "string", isOptional: true },
            { name: "target_weight", type: "number", isOptional: true },
            { name: "rest_seconds", type: "number", isOptional: true },
            { name: "superset_group", type: "number", isOptional: true },
            { name: "sort_order", type: "number" },
            { name: "notes", type: "string", isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 5,
      steps: [
        addColumns({
          table: "plan_days",
          columns: [{ name: "updated_at", type: "number" }],
        }),
        addColumns({
          table: "plan_exercises",
          columns: [{ name: "updated_at", type: "number" }],
        }),
        addColumns({
          table: "workouts",
          columns: [{ name: "updated_at", type: "number" }],
        }),
        addColumns({
          table: "workout_exercises",
          columns: [{ name: "updated_at", type: "number" }],
        }),
        addColumns({
          table: "workout_sets",
          columns: [{ name: "updated_at", type: "number" }],
        }),
        addColumns({
          table: "personal_records",
          columns: [{ name: "updated_at", type: "number" }],
        }),
        addColumns({
          table: "template_days",
          columns: [{ name: "updated_at", type: "number" }],
        }),
        addColumns({
          table: "template_exercises",
          columns: [{ name: "updated_at", type: "number" }],
        }),
        createTable({
          name: "sync_queue",
          columns: [
            { name: "table_name", type: "string", isIndexed: true },
            { name: "record_id", type: "string", isIndexed: true },
            { name: "action_type", type: "string", isIndexed: true },
            { name: "payload", type: "string" },
            { name: "created_at", type: "number", isIndexed: true },
          ],
        }),
      ],
    },
    {
      toVersion: 6,
      steps: [
        createTable({
          name: "challenges",
          columns: [
            { name: "type", type: "string", isIndexed: true },
            { name: "target_value", type: "number" },
            { name: "current_value", type: "number" },
            { name: "start_date", type: "number", isIndexed: true },
            { name: "end_date", type: "number", isIndexed: true },
            { name: "is_completed", type: "boolean", isIndexed: true },
            { name: "created_at", type: "number", isIndexed: true },
            { name: "updated_at", type: "number", isIndexed: true },
          ],
        }),
      ],
    },
    {
      toVersion: 7,
      steps: [
        createTable({
          name: "coach_clients",
          columns: [
            { name: "coach_id", type: "string", isIndexed: true },
            { name: "client_id", type: "string", isIndexed: true },
            { name: "status", type: "string", isIndexed: true },
            { name: "notes", type: "string", isOptional: true },
            { name: "created_at", type: "number", isIndexed: true },
          ],
        }),
        createTable({
          name: "workout_comments",
          columns: [
            { name: "coach_id", type: "string", isIndexed: true },
            { name: "workout_id", type: "string", isIndexed: true },
            { name: "comment", type: "string" },
            { name: "created_at", type: "number", isIndexed: true },
          ],
        }),
        createTable({
          name: "workout_videos",
          columns: [
            { name: "workout_set_id", type: "string", isIndexed: true },
            { name: "file_path", type: "string" },
            { name: "cloud_url", type: "string", isOptional: true },
            { name: "duration_seconds", type: "number" },
            { name: "file_size_bytes", type: "number" },
            { name: "created_at", type: "number", isIndexed: true },
          ],
        }),
      ],
    },
  ],
});

export default migrations;
