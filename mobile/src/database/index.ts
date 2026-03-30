import { Database } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";

import { modelClasses } from "../models";
import migrations from "./migrations";
import schema from "./schema";

const adapter = new SQLiteAdapter({
  dbName: "wstrack",
  schema,
  migrations,
  jsi: true,
  onSetUpError: (error: unknown) => {
    console.error("WatermelonDB setup failed", error);
  },
});

export const database = new Database({
  adapter,
  modelClasses,
});

export default database;
