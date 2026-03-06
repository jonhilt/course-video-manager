import { Console, Effect, Schema } from "effect";
import type { Route } from "./+types/api.lessons.reorder";
import { DBFunctionsService } from "@/services/db-service.server";
import { RepoWriteService } from "@/services/repo-write-service";
import { runtimeLive } from "@/services/layer.server";
import { withDatabaseDump } from "@/services/dump-service";
import {
  computeRenumberingPlan,
  parseLessonPath,
} from "@/services/lesson-path-service";
import { data } from "react-router";

const reorderSchema = Schema.Struct({
  sectionId: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Section ID is required" })
  ),
  lessonIds: Schema.transform(Schema.String, Schema.Array(Schema.String), {
    decode: (s) => JSON.parse(s) as string[],
    encode: (a) => JSON.stringify(a),
  }),
});

export const action = async (args: Route.ActionArgs) => {
  const formData = await args.request.formData();
  const formDataObject = Object.fromEntries(formData);

  return Effect.gen(function* () {
    const { sectionId, lessonIds } =
      yield* Schema.decodeUnknown(reorderSchema)(formDataObject);

    const db = yield* DBFunctionsService;
    const repoWrite = yield* RepoWriteService;

    // Get section with hierarchy to find repo path
    const section = yield* db.getSectionWithHierarchyById(sectionId);
    const repoPath = section.repoVersion.repo.filePath;
    const sectionPath = section.path;

    // Get all lessons for the section, ordered by their current order
    const sectionLessons = yield* db.getLessonsBySectionId(sectionId);

    // Compute the renumbering plan using the full ordered array from the client
    const lessonsForReorder = sectionLessons.map((l) => ({
      id: l.id,
      path: l.path,
    }));
    const renames = computeRenumberingPlan(lessonsForReorder, lessonIds);

    if (renames.length > 0) {
      // Execute git mv for all affected directories
      yield* repoWrite.renameLessons({
        repoPath,
        sectionPath,
        renames: renames.map((r) => ({
          oldPath: r.oldPath,
          newPath: r.newPath,
        })),
      });

      // Update DB for each affected lesson
      for (const rename of renames) {
        const parsed = parseLessonPath(rename.newPath);
        if (parsed) {
          yield* db.updateLesson(rename.id, {
            path: rename.newPath,
            lessonNumber: parsed.lessonNumber,
          });
        }
      }
    }

    return { success: true, renames };
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
