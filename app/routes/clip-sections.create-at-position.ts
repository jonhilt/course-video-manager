import { withDatabaseDump } from "@/services/dump-service";
import { Console, Effect, Schema } from "effect";
import { DBFunctionsService } from "@/services/db-service";
import { runtimeLive } from "@/services/layer";
import type { Route } from "./+types/clip-sections.create-at-position";
import { data } from "react-router";

const createClipSectionAtPositionSchema = Schema.Struct({
  videoId: Schema.String,
  name: Schema.String,
  position: Schema.Union(Schema.Literal("before"), Schema.Literal("after")),
  targetItemId: Schema.String,
  targetItemType: Schema.Union(
    Schema.Literal("clip"),
    Schema.Literal("clip-section")
  ),
});

export const action = async (args: Route.ActionArgs) => {
  const json = await args.request.json();

  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const { videoId, name, position, targetItemId, targetItemType } =
      yield* Schema.decodeUnknown(createClipSectionAtPositionSchema)(json);

    const clipSection = yield* db.createClipSectionAtPosition(
      videoId,
      name,
      position,
      targetItemId,
      targetItemType
    );

    return { success: true, clipSection };
  }).pipe(
    withDatabaseDump,
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("ParseError", () => {
      return Effect.die(data("Invalid request", { status: 400 }));
    }),
    Effect.catchTag("NotFoundError", () => {
      return Effect.die(data("Target item not found", { status: 404 }));
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
