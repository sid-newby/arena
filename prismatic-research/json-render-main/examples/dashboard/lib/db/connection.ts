import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Lazy initialization to allow builds without DATABASE_URL
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _migrationClient: ReturnType<typeof postgres> | null = null;

function getConnectionString(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  return connectionString;
}

// For query purposes - lazily initialized
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    if (!_db) {
      const connectionString = getConnectionString();
      const queryClient = postgres(connectionString);
      _db = drizzle(queryClient, { schema });
    }
    return Reflect.get(_db, prop);
  },
});

// For migrations - lazily initialized
export function getMigrationClient() {
  if (!_migrationClient) {
    const connectionString = getConnectionString();
    _migrationClient = postgres(connectionString, { max: 1 });
  }
  return _migrationClient;
}
