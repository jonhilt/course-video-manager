import { Console, Effect, Schema } from "effect";
import type { Route } from "./+types/api.sections.$sectionId.update-name";
import { CourseWriteService } from "@/services/course-write-service";
import { runtimeLive } from "@/services/layer.server";
import { withDatabaseDump } from "@/services/dump-service";
import { toSlug } from "@/services/lesson-path-service";
import { data } from "react-router";

const updateSectionNameSchema = Schema.Struct({
  title: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Section name cannot be empty" })
  ),
});

export const action = async (args: Route.ActionArgs) => {
  const formData = await args.request.formData();
  const formDataObject = Object.fromEntries(formData);

  return Effect.gen(function* () {
    const { title } = yield* Schema.decodeUnknown(updateSectionNameSchema)(
      formDataObject
    );

    const newSlug = toSlug(title.trim()) || "untitled";

    const service = yield* CourseWriteService;
    return yield* service.renameSection(args.params.sectionId, newSlug);
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
      return Effect.die(data("Section not found", { status: 404 }));
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
