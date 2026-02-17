import { Console, Effect, Schema } from "effect";
import { DBFunctionsService } from "@/services/db-service";
import { runtimeLive } from "@/services/layer";
import type { Route } from "./+types/api.videos.delete";
import { withDatabaseDump } from "@/services/dump-service";
import { data } from "react-router";

const deleteVideoSchema = Schema.Struct({
  videoId: Schema.String,
});

export const action = async (args: Route.ActionArgs) => {
  const formData = await args.request.formData();
  const formDataObject = Object.fromEntries(formData);
  return Effect.gen(function* () {
    const { videoId } =
      yield* Schema.decodeUnknown(deleteVideoSchema)(formDataObject);

    const db = yield* DBFunctionsService;

    yield* db.deleteVideo(videoId);

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
