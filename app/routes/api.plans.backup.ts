import { Console, Effect } from "effect";
import { FileSystem, Path } from "@effect/platform";
import type { Route } from "./+types/api.plans.backup";
import { runtimeLive } from "@/services/layer";
import { data } from "react-router";

// Store the backup file in the repo root, git-ignored
const BACKUP_FILENAME = "plans-backup.json";

export const action = async (args: Route.ActionArgs) => {
  const body = await args.request.json();

  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const plans = body.plans;

    if (!Array.isArray(plans)) {
      return yield* Effect.die(data("plans must be an array", { status: 400 }));
    }

    // Write to the repo root directory
    const backupPath = path.resolve(process.cwd(), BACKUP_FILENAME);

    // Write plans as formatted JSON
    const jsonContent = JSON.stringify(plans, null, 2);
    yield* fs.writeFileString(backupPath, jsonContent);

    return { success: true };
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
