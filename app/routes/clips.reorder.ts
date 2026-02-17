import { withDatabaseDump } from "@/services/dump-service";
import { Console, Effect, Schema } from "effect";
import { DBFunctionsService } from "@/services/db-service";
import { runtimeLive } from "@/services/layer";
import type { Route } from "./+types/clips.reorder";
import { data } from "react-router";

const reorderClipSchema = Schema.Struct({
  clipId: Schema.String,
  direction: Schema.Union(Schema.Literal("up"), Schema.Literal("down")),
});

export const action = async (args: Route.ActionArgs) => {
  const json = await args.request.json();

  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const { clipId, direction } =
      yield* Schema.decodeUnknown(reorderClipSchema)(json);

    yield* db.reorderClip(clipId, direction);

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
