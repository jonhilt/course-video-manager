import { Console, Effect, Schema } from "effect";
import { DBFunctionsService } from "@/services/db-service";
import { runtimeLive } from "@/services/layer";
import type { Route } from "./+types/api.videos.create";
import { data, redirect } from "react-router";
import { withDatabaseDump } from "@/services/dump-service";

const createVideoSchema = Schema.Struct({
  path: Schema.String,
});

export const action = async (args: Route.ActionArgs) => {
  const formData = await args.request.formData();
  const formDataObject = Object.fromEntries(formData);

  return Effect.gen(function* () {
    const result =
      yield* Schema.decodeUnknown(createVideoSchema)(formDataObject);

    const db = yield* DBFunctionsService;

    const video = yield* db.createStandaloneVideo({
      path: result.path,
    });

    return redirect(`/videos/${video.id}/edit`);
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
