import { Effect } from "effect";
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
  titleFromSlug,
} from "./section-path-service";
import { createSectionOps } from "./course-write-service.helpers";
import { CourseWriteError } from "./course-write-service.types";
import {
  RepoSyncValidationService,
  RepoSyncError,
} from "./repo-sync-validation";

export { CourseWriteError } from "./course-write-service.types";
export { RepoSyncError } from "./repo-sync-validation";

export class CourseWriteService extends Effect.Service<CourseWriteService>()(
  "CourseWriteService",
  {
    effect: Effect.gen(function* () {
      const db = yield* DBFunctionsService;
      const repoWrite = yield* RepoWriteService;
      const syncService = yield* RepoSyncValidationService;

      const runValidation = syncService.validate().pipe(
        Effect.catchAll((e) => {
          if (e._tag === "RepoSyncError") return Effect.fail(e);
          return Effect.fail(
            new RepoSyncError({
              cause: e,
              message: `Sync validation encountered an error: ${String(e)}`,
            })
          );
        })
      );

      const withSyncValidation = <A, E>(
        effect: Effect.Effect<A, E>
      ): Effect.Effect<A, E | RepoSyncError> =>
        Effect.gen(function* () {
          yield* runValidation;
          const result = yield* effect;
          yield* runValidation;
          return result;
        });

      const { renumberSections, reorderSections, renameSection } =
        createSectionOps(db, repoWrite);

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
        const repoVersionId = lesson.section.repoVersionId;
        let sectionPath = lesson.section.path;
        const parsed = parseSectionPath(sectionPath);
        const slug =
          toSlug(lesson.title || "") || toSlug(lesson.path) || "untitled";

        // If the section path is not a valid NN-slug format, it's a ghost section
        // that needs to be materialized (title → slugified path)
        let sectionMaterialized = false;
        let sectionNumber: number;
        if (!parsed) {
          // Compute the correct section number: count real sections before
          // this one, plus 1 for itself.
          const allSections =
            yield* db.getSectionsByRepoVersionId(repoVersionId);
          const positionIndex = allSections.findIndex(
            (s) => s.id === lesson.sectionId
          );
          let realBefore = 0;
          for (let i = 0; i < positionIndex; i++) {
            if (parseSectionPath(allSections[i]!.path)) realBefore++;
          }
          sectionNumber = realBefore + 1;

          const sectionSlug = toSlug(sectionPath) || "untitled";
          sectionPath = buildSectionPath(sectionNumber, sectionSlug);
          yield* db.updateSectionPath(lesson.sectionId, sectionPath);
          sectionMaterialized = true;
        } else {
          sectionNumber = parsed.sectionNumber;
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

        // If a ghost section was materialized, renumber other sections
        if (sectionMaterialized) {
          yield* renumberSections(repoVersionId, repoPath);
        }

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

      /** Creates a ghost lesson. Supports optional insertion before/after a lesson. */
      const addGhostLesson = Effect.fn("addGhostLesson")(function* (
        sectionId: string,
        title: string,
        opts?: { adjacentLessonId?: string; position?: "before" | "after" }
      ) {
        const lessons = yield* db.getLessonsBySectionId(sectionId);
        const maxOrder =
          lessons.length > 0 ? Math.max(...lessons.map((l) => l.order)) : 0;
        let insertOrder = maxOrder + 1;

        if (opts?.adjacentLessonId && opts?.position) {
          const adjIdx = lessons.findIndex(
            (l) => l.id === opts.adjacentLessonId
          );
          if (adjIdx !== -1) {
            const idx = opts.position === "after" ? adjIdx + 1 : adjIdx;
            for (let i = idx; i < lessons.length; i++) {
              yield* db.updateLessonOrder(
                lessons[i]!.id,
                lessons[i]!.order + 1
              );
            }
            insertOrder = lessons[idx] ? lessons[idx]!.order : maxOrder + 1;
          }
        }

        const [newLesson] = yield* db.createGhostLesson(sectionId, {
          title,
          path: toSlug(title) || "untitled",
          order: insertOrder,
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
        // and renumber other sections to close the gap
        if (remainingReal.length === 0) {
          const sectionParsed = parseSectionPath(sectionPath);
          if (sectionParsed) {
            const title = titleFromSlug(sectionParsed.slug);
            yield* db.updateSectionPath(lesson.sectionId, title);
            yield* renumberSections(lesson.section.repoVersionId, repoPath);
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
       * Deletes a ghost section and all its ghost lessons.
       * Fails if the section contains any real lessons.
       */
      const deleteSection = Effect.fn("deleteSection")(function* (
        sectionId: string
      ) {
        const section = yield* db.getSectionWithHierarchyById(sectionId);
        const repoPath = section.repoVersion.repo.filePath;
        const repoVersionId = section.repoVersionId;

        const sectionLessons = yield* db.getLessonsBySectionId(sectionId);
        const realLessons = sectionLessons.filter(
          (l) => l.fsStatus !== "ghost"
        );

        if (realLessons.length > 0) {
          return yield* new CourseWriteError({
            cause: null,
            message:
              "Cannot delete section with real lessons. Convert or delete them first.",
          });
        }

        // Delete all ghost lessons in this section
        for (const lesson of sectionLessons) {
          yield* db.deleteLesson(lesson.id);
        }

        // Delete the section itself
        yield* db.deleteSection(sectionId);

        // Renumber remaining sections to close the gap
        yield* renumberSections(repoVersionId, repoPath);

        return { success: true };
      });

      return {
        materializeGhost: (...args: Parameters<typeof materializeGhost>) =>
          withSyncValidation(materializeGhost(...args)),
        addGhostSection,
        addGhostLesson,
        deleteLesson: (...args: Parameters<typeof deleteLesson>) =>
          withSyncValidation(deleteLesson(...args)),
        deleteSection: (...args: Parameters<typeof deleteSection>) =>
          withSyncValidation(deleteSection(...args)),
        convertToGhost: (...args: Parameters<typeof convertToGhost>) =>
          withSyncValidation(convertToGhost(...args)),
        renameLesson: (...args: Parameters<typeof renameLesson>) =>
          withSyncValidation(renameLesson(...args)),
        reorderLessons: (...args: Parameters<typeof reorderLessons>) =>
          withSyncValidation(reorderLessons(...args)),
        moveToSection: (...args: Parameters<typeof moveToSection>) =>
          withSyncValidation(moveToSection(...args)),
        reorderSections: (...args: Parameters<typeof reorderSections>) =>
          withSyncValidation(reorderSections(...args)),
        renameSection: (...args: Parameters<typeof renameSection>) =>
          withSyncValidation(renameSection(...args)),
      };
    }),
    dependencies: [
      DBFunctionsService.Default,
      RepoWriteService.Default,
      RepoSyncValidationService.Default,
    ],
  }
) {}
