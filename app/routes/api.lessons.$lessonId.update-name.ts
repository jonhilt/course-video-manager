import { Console, Data, Effect, Schema } from "effect";
import type { Route } from "./+types/api.lessons.$lessonId.update-name";
import { DBFunctionsService } from "@/services/db-service";
import { runtimeLive } from "@/services/layer";
import { withDatabaseDump } from "@/services/dump-service";
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

class InvalidOrderError extends Data.TaggedError("InvalidOrderError")<{
  message: string;
}> {}

export const action = async (args: Route.ActionArgs) => {
  const formData = await args.request.formData();
  const formDataObject = Object.fromEntries(formData);

  return Effect.gen(function* () {
    const { path } = yield* Schema.decodeUnknown(updateLessonNameSchema)(
      formDataObject
    );

    const db = yield* DBFunctionsService;

    const order = Number(path.split("-")[0]);

    if (isNaN(order)) {
      return yield* new InvalidOrderError({
        message: "String does not contain a valid order",
      });
    }

    // Fetch current lesson to preserve sectionId and order
    const currentLesson = yield* db.getLessonById(args.params.lessonId);

    yield* db.updateLesson(args.params.lessonId, {
      path: path.trim(),
      sectionId: currentLesson.sectionId,
      lessonNumber: order,
    });

    return { success: true };
  }).pipe(
    withDatabaseDump,
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("ParseError", () => {
      return Effect.die(data("Invalid request", { status: 400 }));
    }),
    Effect.catchTag("InvalidOrderError", () => {
      return Effect.die(data("Invalid order in path", { status: 400 }));
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
