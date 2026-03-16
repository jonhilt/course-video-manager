import { Console, Effect } from "effect";
import type { Route } from "./+types/api.lessons.$lessonId.convert-to-ghost";
import { CourseWriteService } from "@/services/course-write-service";
import { runtimeLive } from "@/services/layer.server";
import { withDatabaseDump } from "@/services/dump-service";
import { data } from "react-router";

export const action = async (args: Route.ActionArgs) => {
  return Effect.gen(function* () {
    const service = yield* CourseWriteService;
    return yield* service.convertToGhost(args.params.lessonId);
  }).pipe(
    withDatabaseDump,
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("CourseRepoSyncError", (e) => {
      return Effect.die(data(e.message, { status: 409 }));
    }),
    Effect.catchTag("CourseWriteError", () => {
      return Effect.die(data("Lesson is already a ghost", { status: 400 }));
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
