import { Console, Effect } from "effect";
import type { Route } from "./+types/api.lessons.$lessonId.convert-to-ghost";
import { DBFunctionsService } from "@/services/db-service.server";
import { RepoWriteService } from "@/services/repo-write-service";
import { runtimeLive } from "@/services/layer.server";
import { withDatabaseDump } from "@/services/dump-service";
import { data } from "react-router";

export const action = async (args: Route.ActionArgs) => {
  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const repoWrite = yield* RepoWriteService;

    const lesson = yield* db.getLessonWithHierarchyById(args.params.lessonId);

    if (lesson.fsStatus !== "real") {
      return Effect.die(data("Lesson is already a ghost", { status: 400 }));
    }

    const repoPath = lesson.section.repoVersion.repo.filePath;
    const sectionPath = lesson.section.path;

    // Remove lesson directory from disk
    yield* repoWrite.deleteLesson({
      repoPath,
      sectionPath,
      lessonDirName: lesson.path,
    });

    // Update lesson: set fsStatus to ghost
    yield* db.updateLesson(args.params.lessonId, {
      fsStatus: "ghost",
    });

    return { success: true };
  }).pipe(
    withDatabaseDump,
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("NotFoundError", () => {
      return Effect.die(data("Lesson not found", { status: 404 }));
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
