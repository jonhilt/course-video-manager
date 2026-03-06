import { Console, Effect, Schema } from "effect";
import type { Route } from "./+types/api.sections.reorder";
import { DBFunctionsService } from "@/services/db-service.server";
import { RepoWriteService } from "@/services/repo-write-service";
import { runtimeLive } from "@/services/layer.server";
import { withDatabaseDump } from "@/services/dump-service";
import { computeSectionRenumberingPlan } from "@/services/section-path-service";
import {
  buildLessonPath,
  parseLessonPath,
} from "@/services/lesson-path-service";
import { data } from "react-router";

const reorderSchema = Schema.Struct({
  repoVersionId: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Repo version ID is required" })
  ),
  sectionIds: Schema.transform(Schema.String, Schema.Array(Schema.String), {
    decode: (s) => JSON.parse(s) as string[],
    encode: (a) => JSON.stringify(a),
  }),
});

export const action = async (args: Route.ActionArgs) => {
  const formData = await args.request.formData();
  const formDataObject = Object.fromEntries(formData);

  return Effect.gen(function* () {
    const { sectionIds } =
      yield* Schema.decodeUnknown(reorderSchema)(formDataObject);

    const db = yield* DBFunctionsService;
    const repoWrite = yield* RepoWriteService;

    // Get all sections to compute renumbering plan
    const allSections = yield* db.getSectionsByIds(sectionIds);
    const sectionsForReorder = allSections.map((s) => ({
      id: s.id,
      path: s.path,
    }));

    // Get repo path from the first section's hierarchy
    const firstSection = yield* db.getSectionWithHierarchyById(sectionIds[0]!);
    const repoPath = firstSection.repoVersion.repo.filePath;

    // Compute which section directories need filesystem renames
    const sectionRenames = computeSectionRenumberingPlan(
      sectionsForReorder,
      sectionIds
    );

    if (sectionRenames.length > 0) {
      // Execute git mv for section directories (two-pass to avoid collisions)
      yield* repoWrite.renameSections({
        repoPath,
        renames: sectionRenames.map((r) => ({
          oldPath: r.oldPath,
          newPath: r.newPath,
        })),
      });

      // Update DB paths for renamed sections
      for (const rename of sectionRenames) {
        yield* db.updateSectionPath(rename.id, rename.newPath);
      }

      // Rename lessons within each renamed section to update their XX prefix
      for (const sectionRename of sectionRenames) {
        const sectionLessons = yield* db.getLessonsBySectionId(
          sectionRename.id
        );
        const realLessons = sectionLessons.filter(
          (l) => l.fsStatus !== "ghost"
        );

        if (realLessons.length === 0) continue;

        // Compute lesson renames: update the section number prefix
        const lessonRenames: Array<{ oldPath: string; newPath: string }> = [];
        for (const lesson of realLessons) {
          const parsed = parseLessonPath(lesson.path);
          if (!parsed) continue;

          const newLessonPath = buildLessonPath(
            sectionRename.newSectionNumber,
            parsed.lessonNumber,
            parsed.slug
          );
          if (newLessonPath !== lesson.path) {
            lessonRenames.push({
              oldPath: lesson.path,
              newPath: newLessonPath,
            });
          }
        }

        if (lessonRenames.length > 0) {
          // Execute git mv for lessons within the renamed section
          yield* repoWrite.renameLessons({
            repoPath,
            sectionPath: sectionRename.newPath,
            renames: lessonRenames,
          });

          // Update DB paths for renamed lessons
          for (const lesson of realLessons) {
            const parsed = parseLessonPath(lesson.path);
            if (!parsed) continue;

            const newLessonPath = buildLessonPath(
              sectionRename.newSectionNumber,
              parsed.lessonNumber,
              parsed.slug
            );
            if (newLessonPath !== lesson.path) {
              yield* db.updateLesson(lesson.id, {
                path: newLessonPath,
                lessonNumber: parsed.lessonNumber,
              });
            }
          }
        }
      }
    }

    // Update the order field for each section based on its position in the array
    for (let i = 0; i < sectionIds.length; i++) {
      yield* db.updateSectionOrder(sectionIds[i]!, i);
    }

    return { success: true };
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
