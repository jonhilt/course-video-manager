import { Data, Effect } from "effect";
import { DBFunctionsService } from "./db-service.server";
import { RepoWriteService } from "./repo-write-service";
import {
  toSlug,
  computeInsertionPlan,
  computeRenumberingPlan,
  parseLessonPath,
  buildLessonPath,
} from "./lesson-path-service";
import {
  parseSectionPath,
  buildSectionPath,
  computeSectionRenumberingPlan,
  titleFromSlug,
} from "./section-path-service";

export class CourseWriteError extends Data.TaggedError("CourseWriteError")<{
  cause: unknown;
  message: string;
}> {}

export class CourseWriteService extends Effect.Service<CourseWriteService>()(
  "CourseWriteService",
  {
    effect: Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const repoWrite = yield* RepoWriteService;

      /**
       * Materializes a ghost lesson to disk.
       *
       * Fetches the ghost lesson and its section hierarchy, computes the
       * insertion position among real lessons, renames shifted lessons on
       * disk, creates the new lesson directory, and updates all affected
       * DB records.
       */
      const materializeGhost = Effect.fn("materializeGhost")(function* (
        lessonId: string
      ) {
        const lesson = yield* db.getLessonWithHierarchyById(lessonId);

        if (lesson.fsStatus !== "ghost") {
          return yield* new CourseWriteError({
            cause: null,
            message: "Lesson is already on disk",
          });
        }

        const repoPath = lesson.section.repoVersion.repo.filePath;
        let sectionPath = lesson.section.path;
        const parsed = parseSectionPath(sectionPath);
        const sectionNumber = parsed?.sectionNumber ?? 1;
        const slug =
          toSlug(lesson.title || "") || toSlug(lesson.path) || "untitled";

        // If the section path is not a valid NN-slug format, it's a ghost section
        // that needs to be materialized (title → slugified path)
        if (!parsed) {
          const sectionSlug = toSlug(sectionPath) || "untitled";
          sectionPath = buildSectionPath(sectionNumber, sectionSlug);
          yield* db.updateSectionPath(lesson.sectionId, sectionPath);
        }

        // Get all lessons in the section to determine insert position
        const sectionLessons = yield* db.getLessonsBySectionId(
          lesson.sectionId
        );
        const ghostOrder = lesson.order;

        // Find the ghost's position among real lessons only (sorted by order)
        const realLessons = sectionLessons.filter(
          (l) => l.fsStatus !== "ghost"
        );
        let insertAtIndex = realLessons.length; // default: append at end
        for (let i = 0; i < realLessons.length; i++) {
          if (realLessons[i]!.order > ghostOrder) {
            insertAtIndex = i;
            break;
          }
        }

        const existingRealLessons = realLessons.map((l) => ({
          id: l.id,
          path: l.path,
        }));

        const plan = computeInsertionPlan({
          existingRealLessons,
          insertAtIndex,
          sectionNumber,
          slug,
        });

        // Rename shifted lessons on disk first
        if (plan.renames.length > 0) {
          yield* repoWrite.renameLessons({
            repoPath,
            sectionPath,
            renames: plan.renames.map((r) => ({
              oldPath: r.oldPath,
              newPath: r.newPath,
            })),
          });

          // Update DB paths for renamed lessons
          for (const rename of plan.renames) {
            const renamedParsed = parseLessonPath(rename.newPath);
            if (renamedParsed) {
              yield* db.updateLesson(rename.id, {
                path: rename.newPath,
              });
            }
          }
        }

        // Create the lesson directory on the filesystem
        yield* repoWrite.createLessonDirectory({
          repoPath,
          sectionPath,
          lessonDirName: plan.newLessonDirName,
        });

        // Update lesson: set fsStatus to real and update path
        yield* db.updateLesson(lessonId, {
          fsStatus: "real",
          path: plan.newLessonDirName,
          sectionId: lesson.sectionId,
        });

        return { success: true, path: plan.newLessonDirName };
      });

      /**
       * Creates a ghost section in the database (no filesystem operations).
       * Stores the raw title as the section path.
       */
      const addGhostSection = Effect.fn("addGhostSection")(function* (
        repoVersionId: string,
        title: string,
        maxOrder: number = 0
      ) {
        const sectionNumber = maxOrder + 1;
        const [newSection] = yield* db.createSections({
          repoVersionId,
          sections: [
            {
              sectionPathWithNumber: title,
              sectionNumber,
            },
          ],
        });

        return { success: true, sectionId: newSection!.id };
      });

      /**
       * Creates a ghost lesson in the database (no filesystem operations).
       * Appends at the end of the section's lesson order.
       */
      const addGhostLesson = Effect.fn("addGhostLesson")(function* (
        sectionId: string,
        title: string
      ) {
        const existingLessons = yield* db.getLessonsBySectionId(sectionId);
        const maxOrder =
          existingLessons.length > 0
            ? Math.max(...existingLessons.map((l) => l.order))
            : 0;

        const slug = toSlug(title) || "untitled";

        const [newLesson] = yield* db.createGhostLesson(sectionId, {
          title,
          path: slug,
          order: maxOrder + 1,
        });

        return { success: true, lessonId: newLesson!.id };
      });

      /**
       * Deletes a lesson. If real, removes the directory from disk first.
       * Then deletes the DB record.
       */
      const deleteLesson = Effect.fn("deleteLesson")(function* (
        lessonId: string
      ) {
        const lesson = yield* db.getLessonWithHierarchyById(lessonId);

        if (lesson.fsStatus !== "ghost") {
          const repoPath = lesson.section.repoVersion.repo.filePath;
          const sectionPath = lesson.section.path;

          yield* repoWrite.deleteLesson({
            repoPath,
            sectionPath,
            lessonDirName: lesson.path,
          });
        }

        yield* db.deleteLesson(lessonId);

        return { success: true };
      });

      /**
       * Converts a real lesson to a ghost.
       * Deletes the directory from disk, renumbers remaining real lessons
       * to close the numbering gap, and marks the lesson as ghost in DB.
       */
      const convertToGhost = Effect.fn("convertToGhost")(function* (
        lessonId: string
      ) {
        const lesson = yield* db.getLessonWithHierarchyById(lessonId);

        if (lesson.fsStatus !== "real") {
          return yield* new CourseWriteError({
            cause: null,
            message: "Lesson is already a ghost",
          });
        }

        const repoPath = lesson.section.repoVersion.repo.filePath;
        const sectionPath = lesson.section.path;
        const parsed = parseSectionPath(sectionPath);
        const sectionNumber = parsed?.sectionNumber ?? 1;

        // Delete the lesson directory from disk
        yield* repoWrite.deleteLesson({
          repoPath,
          sectionPath,
          lessonDirName: lesson.path,
        });

        // Mark lesson as ghost in DB
        yield* db.updateLesson(lessonId, {
          fsStatus: "ghost",
        });

        // Renumber remaining real lessons to close the gap
        const sectionLessons = yield* db.getLessonsBySectionId(
          lesson.sectionId
        );
        const remainingReal = sectionLessons.filter(
          (l) => l.fsStatus !== "ghost" && l.id !== lessonId
        );

        if (remainingReal.length > 0) {
          const renames: { id: string; oldPath: string; newPath: string }[] =
            [];
          for (let i = 0; i < remainingReal.length; i++) {
            const l = remainingReal[i]!;
            const p = parseLessonPath(l.path);
            if (!p) continue;
            const newPath = buildLessonPath(sectionNumber, i + 1, p.slug);
            if (newPath !== l.path) {
              renames.push({ id: l.id, oldPath: l.path, newPath });
            }
          }

          if (renames.length > 0) {
            yield* repoWrite.renameLessons({
              repoPath,
              sectionPath,
              renames: renames.map((r) => ({
                oldPath: r.oldPath,
                newPath: r.newPath,
              })),
            });

            for (const rename of renames) {
              yield* db.updateLesson(rename.id, {
                path: rename.newPath,
              });
            }
          }
        }

        // If no real lessons remain, revert the section path to title case
        if (remainingReal.length === 0) {
          const sectionParsed = parseSectionPath(sectionPath);
          if (sectionParsed) {
            const title = titleFromSlug(sectionParsed.slug);
            yield* db.updateSectionPath(lesson.sectionId, title);
          }
        }

        return { success: true };
      });

      /**
       * Renames a lesson's slug (preserves lesson number).
       * If the slug hasn't changed, this is a no-op.
       * For ghost lessons (unparseable paths), updates the DB path directly.
       */
      const renameLesson = Effect.fn("renameLesson")(function* (
        lessonId: string,
        newSlug: string
      ) {
        const lesson = yield* db.getLessonWithHierarchyById(lessonId);

        const oldParsed = parseLessonPath(lesson.path);

        // Ghost lesson with unparseable path — just update the slug in DB
        if (!oldParsed) {
          if (lesson.path === newSlug) {
            return { success: true, path: lesson.path };
          }
          yield* db.updateLesson(lessonId, { path: newSlug });
          return { success: true, path: newSlug };
        }

        if (oldParsed.slug === newSlug) {
          return { success: true, path: lesson.path };
        }

        const sectionNumber =
          oldParsed.sectionNumber ??
          parseSectionPath(lesson.section.path)?.sectionNumber ??
          1;
        const newPath = buildLessonPath(
          sectionNumber,
          oldParsed.lessonNumber,
          newSlug
        );

        if (lesson.fsStatus !== "ghost") {
          const repoPath = lesson.section.repoVersion.repo.filePath;
          const sectionPath = lesson.section.path;

          yield* repoWrite.renameLesson({
            repoPath,
            sectionPath,
            oldLessonDirName: lesson.path,
            newSlug,
          });
        }

        yield* db.updateLesson(lessonId, {
          path: newPath,
        });

        return { success: true, path: newPath };
      });

      /**
       * Reorders lessons within a section.
       * Renames real lesson directories on disk to match the new order,
       * updates DB paths/lessonNumbers for renamed real lessons,
       * and updates the order field for all lessons (ghost + real).
       */
      const reorderLessons = Effect.fn("reorderLessons")(function* (
        sectionId: string,
        newOrderIds: readonly string[]
      ) {
        const section = yield* db.getSectionWithHierarchyById(sectionId);
        const repoPath = section.repoVersion.repo.filePath;
        const sectionPath = section.path;

        const sectionLessons = yield* db.getLessonsBySectionId(sectionId);

        // Only real lessons participate in filesystem renaming
        const realLessons = sectionLessons.filter(
          (l) => l.fsStatus !== "ghost"
        );
        const realLessonIds = newOrderIds.filter((id) =>
          realLessons.some((l) => l.id === id)
        );
        const lessonsForReorder = realLessons.map((l) => ({
          id: l.id,
          path: l.path,
        }));
        const renames = computeRenumberingPlan(
          lessonsForReorder,
          realLessonIds
        );

        if (renames.length > 0) {
          yield* repoWrite.renameLessons({
            repoPath,
            sectionPath,
            renames: renames.map((r) => ({
              oldPath: r.oldPath,
              newPath: r.newPath,
            })),
          });

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

        // Update order for ALL lessons (ghost + real) based on position
        for (let i = 0; i < newOrderIds.length; i++) {
          yield* db.updateLessonOrder(newOrderIds[i]!, i);
        }

        return { success: true, renames };
      });

      /**
       * Moves a lesson to a different section.
       * If real: moves directory via git mv, renumbers source section
       * to close the gap, and assigns the correct lesson number in
       * the target section. If ghost: DB-only update.
       */
      const moveToSection = Effect.fn("moveToSection")(function* (
        lessonId: string,
        targetSectionId: string
      ) {
        const lesson = yield* db.getLessonWithHierarchyById(lessonId);
        const targetLessons = yield* db.getLessonsBySectionId(targetSectionId);
        const maxOrder =
          targetLessons.length > 0
            ? Math.max(...targetLessons.map((l) => l.order))
            : 0;

        // Ghost lesson: DB-only move to end of target section
        if (lesson.fsStatus === "ghost") {
          yield* db.updateLesson(lessonId, { sectionId: targetSectionId });
          yield* db.updateLessonOrder(lessonId, maxOrder + 1);
          return { success: true };
        }

        // Real lesson: filesystem move + renumber both sections
        const repoPath = lesson.section.repoVersion.repo.filePath;
        const sourceSectionPath = lesson.section.path;
        const targetSection =
          yield* db.getSectionWithHierarchyById(targetSectionId);
        const targetSectionPath = targetSection.path;

        const sourceParsed = parseSectionPath(sourceSectionPath);
        const targetParsed = parseSectionPath(targetSectionPath);
        const sourceSectionNumber = sourceParsed?.sectionNumber ?? 1;
        const targetSectionNumber = targetParsed?.sectionNumber ?? 1;

        // Compute new path in target section
        const lessonParsed = parseLessonPath(lesson.path);
        const slug = lessonParsed?.slug ?? lesson.path;
        const targetRealLessons = targetLessons.filter(
          (l) => l.fsStatus !== "ghost"
        );
        const nextLessonNumber = targetRealLessons.length + 1;
        const newLessonPath = buildLessonPath(
          targetSectionNumber,
          nextLessonNumber,
          slug
        );

        // Move the directory via git mv
        yield* repoWrite.moveLessonToSection({
          repoPath,
          sourceSectionPath,
          targetSectionPath,
          oldLessonDirName: lesson.path,
          newLessonDirName: newLessonPath,
        });

        // Update DB: move to target section with new path
        yield* db.updateLesson(lessonId, {
          sectionId: targetSectionId,
          path: newLessonPath,
        });
        yield* db.updateLessonOrder(lessonId, maxOrder + 1);

        // Renumber source section real lessons to close the gap
        const sourceLessons = yield* db.getLessonsBySectionId(lesson.sectionId);
        const sourceRealLessons = sourceLessons.filter(
          (l) => l.fsStatus !== "ghost" && l.id !== lessonId
        );

        if (sourceRealLessons.length > 0) {
          const renames: { id: string; oldPath: string; newPath: string }[] =
            [];
          for (let i = 0; i < sourceRealLessons.length; i++) {
            const l = sourceRealLessons[i]!;
            const p = parseLessonPath(l.path);
            if (!p) continue;
            const newPath = buildLessonPath(sourceSectionNumber, i + 1, p.slug);
            if (newPath !== l.path) {
              renames.push({ id: l.id, oldPath: l.path, newPath });
            }
          }

          if (renames.length > 0) {
            yield* repoWrite.renameLessons({
              repoPath,
              sectionPath: sourceSectionPath,
              renames: renames.map((r) => ({
                oldPath: r.oldPath,
                newPath: r.newPath,
              })),
            });

            for (const rename of renames) {
              yield* db.updateLesson(rename.id, { path: rename.newPath });
            }
          }
        }

        return { success: true };
      });

      /**
       * Reorders sections within a repo version.
       * Renames section directories on disk, updates DB section paths,
       * renames nested lesson directories to match new section number prefix,
       * updates DB lesson paths, and updates section order for all sections.
       */
      const reorderSections = Effect.fn("reorderSections")(function* (
        sectionIds: readonly string[]
      ) {
        // Get all sections to compute renumbering plan
        const allSections = yield* db.getSectionsByIds(sectionIds);
        const sectionsForReorder = allSections.map((s) => ({
          id: s.id,
          path: s.path,
        }));

        // Get repo path from the first section's hierarchy
        const firstSection = yield* db.getSectionWithHierarchyById(
          sectionIds[0]!
        );
        const repoPath = firstSection.repoVersion.repo.filePath;

        // Compute which section directories need filesystem renames
        const sectionRenames = computeSectionRenumberingPlan(
          sectionsForReorder,
          sectionIds
        );

        if (sectionRenames.length > 0) {
          // Determine which sections have directories on disk
          const sectionsWithDir = new Set<string>();
          for (const rename of sectionRenames) {
            const exists = yield* repoWrite.sectionDirExists({
              repoPath,
              sectionPath: rename.oldPath,
            });
            if (exists) {
              sectionsWithDir.add(rename.id);
            }
          }

          const fsRenames = sectionRenames.filter((r) =>
            sectionsWithDir.has(r.id)
          );

          // Execute git mv only for sections with directories on disk
          if (fsRenames.length > 0) {
            yield* repoWrite.renameSections({
              repoPath,
              renames: fsRenames.map((r) => ({
                oldPath: r.oldPath,
                newPath: r.newPath,
              })),
            });
          }

          // Update DB paths for ALL renamed sections (including ghost-only)
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
            const lessonRenames: Array<{ oldPath: string; newPath: string }> =
              [];
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

        // Update the order field for each section based on its position
        for (let i = 0; i < sectionIds.length; i++) {
          yield* db.updateSectionOrder(sectionIds[i]!, i);
        }

        return { success: true };
      });

      /**
       * Renames a section's slug (preserves section number).
       * Renames the section directory on disk via git mv,
       * updates DB section path, and renames nested real lesson
       * directories to match the new section number prefix.
       */
      const renameSection = Effect.fn("renameSection")(function* (
        sectionId: string,
        newSlug: string
      ) {
        const section = yield* db.getSectionWithHierarchyById(sectionId);
        const parsed = parseSectionPath(section.path);

        if (!parsed) {
          return yield* new CourseWriteError({
            cause: null,
            message: `Cannot parse section path: ${section.path}`,
          });
        }

        if (parsed.slug === newSlug) {
          return { success: true, path: section.path };
        }

        const repoPath = section.repoVersion.repo.filePath;
        const newPath = buildSectionPath(parsed.sectionNumber, newSlug);

        // Rename section directory on disk
        yield* repoWrite.renameSections({
          repoPath,
          renames: [{ oldPath: section.path, newPath }],
        });

        // Update DB section path
        yield* db.updateSectionPath(sectionId, newPath);

        return { success: true, path: newPath };
      });

      return {
        materializeGhost,
        addGhostSection,
        addGhostLesson,
        deleteLesson,
        convertToGhost,
        renameLesson,
        reorderLessons,
        moveToSection,
        reorderSections,
        renameSection,
      };
    }),
    dependencies: [DBFunctionsService.Default, RepoWriteService.Default],
  }
) {}
