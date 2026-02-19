/**
 * ClipService Route
 *
 * Single POST endpoint that handles all clip operations via RPC-style events.
 * Replaces multiple individual route files (clips.archive.ts, clips.reorder.ts, etc.)
 */

import * as schema from "@/db/schema";
import {
  handleClipServiceEvent,
  type TtCliAdapter,
} from "@/services/clip-service-handler";
import {
  ClipServiceEventSchema,
  type ClipServiceEvent,
} from "@/services/clip-service";
import { DBFunctionsService } from "@/services/db-service";
import { withDatabaseDump } from "@/services/dump-service";
import { runtimeLive } from "@/services/layer";
import { TotalTypeScriptCLIService } from "@/services/tt-cli-service";
import { Console, Effect, Schema } from "effect";
import { drizzle } from "drizzle-orm/postgres-js";
import { data } from "react-router";
import type { Route } from "./+types/api.clip-service";

// Create database connection for ClipService handler
// This uses the same DATABASE_URL as DrizzleService
function getDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  return drizzle(process.env.DATABASE_URL, { schema });
}

export const action = async (args: Route.ActionArgs) => {
  const json = await args.request.json();

  return Effect.gen(function* () {
    // Access DBFunctionsService to ensure the full dependency tree is available
    // (needed for withDatabaseDump middleware)
    yield* DBFunctionsService;

    // Parse and validate the event
    const event = yield* Schema.decodeUnknown(ClipServiceEventSchema)(json);

    // Get TotalTypeScriptCLIService for OBS operations
    const ttCliService = yield* TotalTypeScriptCLIService;

    // Create adapter that wraps Effect-based CLI service
    const ttCli: TtCliAdapter = {
      getLatestOBSVideoClips: (opts) =>
        ttCliService.getLatestOBSVideoClips(opts).pipe(runtimeLive.runPromise),
    };

    // Get database and handle the event
    const db = getDatabase();
    const result = yield* handleClipServiceEvent(
      db as any,
      event as ClipServiceEvent,
      ttCli
    );

    return result ?? null;
  }).pipe(
    withDatabaseDump,
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("ParseError", () => {
      return Effect.die(data("Invalid request", { status: 400 }));
    }),
    Effect.catchAll((error) => {
      // Check if it's a "not found" type error
      if (
        error instanceof Error &&
        (error.message.includes("not found") ||
          error.message.includes("Could not find"))
      ) {
        return Effect.die(data(error.message, { status: 404 }));
      }
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
