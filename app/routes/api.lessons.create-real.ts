import { Console, Effect, Schema } from "effect";
import type { Route } from "./+types/api.lessons.create-real";
import { CourseWriteService } from "@/services/course-write-service";
import { runtimeLive } from "@/services/layer.server";
import { withDatabaseDump } from "@/services/dump-service";
import { data } from "react-router";

const createRealLessonSchema = Schema.Struct({
  sectionId: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Section ID is required" })
  ),
  title: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Title is required" })
  ),
  adjacentLessonId: Schema.optional(Schema.String),
  position: Schema.optional(Schema.Literal("before", "after")),
  filePath: Schema.optional(Schema.String),
});

export const action = async (args: Route.ActionArgs) => {
  const formData = await args.request.formData();
  const formDataObject = Object.fromEntries(formData);

  return Effect.gen(function* () {
    const { sectionId, title, adjacentLessonId, position, filePath } =
      yield* Schema.decodeUnknown(createRealLessonSchema)(formDataObject);

    const service = yield* CourseWriteService;

    // If filePath is provided, this is a Materialization Cascade for a ghost course
    if (filePath) {
      return yield* service.materializeCourseWithLesson(
        sectionId,
        title,
        filePath,
        { adjacentLessonId, position }
      );
    }

    return yield* service.createRealLesson(sectionId, title, {
      adjacentLessonId,
      position,
    });
  }).pipe(
    withDatabaseDump,
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("ParseError", () => {
      return Effect.succeed(data({ error: "Invalid request" }, { status: 400 }));
    }),
    Effect.catchTag("NotFoundError", () => {
      return Effect.succeed(data({ error: "Section not found" }, { status: 404 }));
    }),
    Effect.catchTag("CourseWriteError", (e) => {
      return Effect.succeed(data({ error: e.message }, { status: 400 }));
    }),
    Effect.catchAll(() => {
      return Effect.succeed(data({ error: "Internal server error" }, { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
