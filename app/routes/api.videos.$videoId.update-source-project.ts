import { Console, Effect, Schema } from "effect";
import type { Route } from "./+types/api.videos.$videoId.update-source-project";
import { DBFunctionsService } from "@/services/db-service.server";
import { runtimeLive } from "@/services/layer.server";
import { withDatabaseDump } from "@/services/dump-service";
import { data } from "react-router";

const updateSourceProjectSchema = Schema.Struct({
  sourceProjectPath: Schema.String,
});

export const action = async (args: Route.ActionArgs) => {
  const formData = await args.request.formData();
  const formDataObject = Object.fromEntries(formData);
  const videoId = args.params.videoId;

  return Effect.gen(function* () {
    const { sourceProjectPath } = yield* Schema.decodeUnknown(
      updateSourceProjectSchema
    )(formDataObject);

    const db = yield* DBFunctionsService;

    yield* db.updateVideoSourceProjectPath({ videoId, sourceProjectPath });

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
