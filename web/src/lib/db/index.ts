import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { serverEnv } from "@/lib/env";
import * as schema from "./schema";

// Reuse the connection in dev (Next.js HMR would otherwise leak sockets).
const globalForDb = globalThis as unknown as {
  _pgClient?: ReturnType<typeof postgres>;
};

function client() {
  if (!globalForDb._pgClient) {
    globalForDb._pgClient = postgres(serverEnv().DATABASE_URL, {
      max: 5,
      idle_timeout: 20,
      prepare: false, // needed for Neon connection pooling.
    });
  }
  return globalForDb._pgClient;
}

export const db = drizzle(client(), { schema });
export { schema };
