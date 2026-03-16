import { Console, Effect, Schema } from "effect";
import type { Route } from "./+types/api.lessons.delete";
import { CourseWriteService } from "@/services/course-write-service";
import { runtimeLive } from "@/services/layer.server";
import { withDatabaseDump } from "@/services/dump-service";
import { data } from "react-router";

const deleteLessonSchema = Schema.Struct({
  lessonId: Schema.String,
});

export const action = async (args: Route.ActionArgs) => {
  const formData = await args.request.formData();
  const formDataObject = Object.fromEntries(formData);

  return Effect.gen(function* () {
    const { lessonId } =
      yield* Schema.decodeUnknown(deleteLessonSchema)(formDataObject);

    const service = yield* CourseWriteService;
    return yield* service.deleteLesson(lessonId);
  }).pipe(
    withDatabaseDump,
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("CourseRepoSyncError", (e) => {
      return Effect.die(data(e.message, { status: 409 }));
    }),
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
