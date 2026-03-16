import { Console, Effect, Schema } from "effect";
import type { Route } from "./+types/api.lessons.$lessonId.update-name";
import { CourseWriteService } from "@/services/course-write-service";
import { runtimeLive } from "@/services/layer.server";
import { withDatabaseDump } from "@/services/dump-service";
import { parseLessonPath } from "@/services/lesson-path-service";
import { data } from "react-router";

const updateLessonNameSchema = Schema.Struct({
  path: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Lesson name cannot be empty" }),
    Schema.filter(
      (s) => {
        // Basic validation: no filesystem-unsafe characters
        const invalidChars = /[<>:"|?*\x00-\x1F]/;
        return !invalidChars.test(s);
      },
      { message: () => "Lesson name contains invalid characters" }
    )
  ),
});

export const action = async (args: Route.ActionArgs) => {
  const formData = await args.request.formData();
  const formDataObject = Object.fromEntries(formData);

  return Effect.gen(function* () {
    const { path: newPath } = yield* Schema.decodeUnknown(
      updateLessonNameSchema
    )(formDataObject);

    const newParsed = parseLessonPath(newPath.trim());
    if (!newParsed) {
      return yield* Effect.die(
        data("Invalid lesson path format", { status: 400 })
      );
    }

    const service = yield* CourseWriteService;
    return yield* service.renameLesson(args.params.lessonId, newParsed.slug);
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
