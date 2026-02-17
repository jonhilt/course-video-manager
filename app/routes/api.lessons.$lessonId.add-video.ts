import { Console, Effect, Schema } from "effect";
import { DBFunctionsService } from "@/services/db-service";
import { runtimeLive } from "@/services/layer";
import type { Route } from "./+types/api.lessons.$lessonId.add-video";
import { data, redirect } from "react-router";
import { withDatabaseDump } from "@/services/dump-service";

const addVideoSchema = Schema.Struct({
  path: Schema.String,
});

export const action = async (args: Route.ActionArgs) => {
  const { lessonId } = args.params;
  const formData = await args.request.formData();
  const formDataObject = Object.fromEntries(formData);

  return Effect.gen(function* () {
    const result = yield* Schema.decodeUnknown(addVideoSchema)(formDataObject);

    const db = yield* DBFunctionsService;
    yield* db.getLessonById(lessonId);

    const video = yield* db.createVideo(lessonId, {
      path: result.path,
      originalFootagePath: "",
    });

    // Check for redirectTo query param to override default redirect
    const url = new URL(args.request.url);
    const redirectTo = url.searchParams.get("redirectTo");
    if (redirectTo === "write") {
      return redirect(`/videos/${video.id}/write`);
    }
    return redirect(`/videos/${video.id}/edit`);
  }).pipe(
    withDatabaseDump,
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("ParseError", () => {
      return Effect.die(data("Invalid request", { status: 400 }));
    }),
    Effect.catchTag("NotFoundError", () => {
      return Effect.die(data("Lesson not found", { status: 404 }));
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
