import { Console, Effect, Schema } from "effect";
import type { Route } from "./+types/api.lessons.add-ghost";
import { CourseWriteService } from "@/services/course-write-service";
import { runtimeLive } from "@/services/layer.server";
import { withDatabaseDump } from "@/services/dump-service";
import { data } from "react-router";

const addGhostLessonSchema = Schema.Struct({
  sectionId: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Section ID is required" })
  ),
  title: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Title is required" })
  ),
  adjacentLessonId: Schema.optional(Schema.String),
  position: Schema.optional(Schema.Literal("before", "after")),
});

export const action = async (args: Route.ActionArgs) => {
  const formData = await args.request.formData();
  const formDataObject = Object.fromEntries(formData);

  return Effect.gen(function* () {
    const { sectionId, title, adjacentLessonId, position } =
      yield* Schema.decodeUnknown(addGhostLessonSchema)(formDataObject);

    const service = yield* CourseWriteService;
    return yield* service.addGhostLesson(sectionId, title, {
      adjacentLessonId,
      position,
    });
  }).pipe(
    withDatabaseDump,
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("ParseError", () => {
      return Effect.die(data("Invalid request", { status: 400 }));
    }),
    Effect.catchTag("NotFoundError", () => {
      return Effect.die(data("Section not found", { status: 404 }));
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
