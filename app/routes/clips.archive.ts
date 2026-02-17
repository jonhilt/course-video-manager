import { Console, Effect, Schema } from "effect";
import { DBFunctionsService } from "@/services/db-service";
import { runtimeLive } from "@/services/layer";
import type { Route } from "./+types/clips.archive";
import { withDatabaseDump } from "@/services/dump-service";
import { data } from "react-router";

const archiveClipsSchema = Schema.Struct({
  clipIds: Schema.Union(Schema.Array(Schema.String), Schema.String),
});

export const action = async (args: Route.ActionArgs) => {
  const json = await args.request.json();

  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const { clipIds } = yield* Schema.decodeUnknown(archiveClipsSchema)(json);

    const resolvedClipIds = typeof clipIds === "string" ? [clipIds] : clipIds;
    yield* Effect.forEach(resolvedClipIds, (clipId) => db.archiveClip(clipId));

    return { success: true };
  }).pipe(
    withDatabaseDump,
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("ParseError", () => {
      return Effect.die(data("Invalid request", { status: 400 }));
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
