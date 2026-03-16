import { Console, Effect } from "effect";
import { FileSystem } from "@effect/platform";
import path from "node:path";
import type { Route } from "./+types/api.videos.$videoId.move-to-course";
import { DBFunctionsService } from "@/services/db-service.server";
import { CourseWriteService } from "@/services/course-write-service";
import { runtimeLive } from "@/services/layer.server";
import { withDatabaseDump } from "@/services/dump-service";
import { getStandaloneVideoFilePath } from "@/services/standalone-video-files";
import { data } from "react-router";

/**
 * Computes a non-conflicting destination filename.
 * If `filename` doesn't exist in `existingFiles`, returns it as-is.
 * Otherwise appends " copy", " copy 2", " copy 3", ... before the extension.
 */
const resolveDestFilename = (
  existingFiles: Set<string>,
  filename: string
): string => {
  if (!existingFiles.has(filename)) return filename;

  const ext = path.extname(filename);
  const base = path.basename(filename, ext);

  let candidate = `${base} copy${ext}`;
  if (!existingFiles.has(candidate)) return candidate;

  let counter = 2;
  while (true) {
    candidate = `${base} copy ${counter}${ext}`;
    if (!existingFiles.has(candidate)) return candidate;
    counter++;
  }
};

export const action = async (args: Route.ActionArgs) => {
  const formData = await args.request.formData();
  const videoId = args.params.videoId;

  const lessonId = formData.get("lessonId");
  const sectionId = formData.get("sectionId");
  const newLessonTitle = formData.get("newLessonTitle");

  // Validate input: either an existing lessonId, or sectionId + newLessonTitle
  const isExistingLesson =
    typeof lessonId === "string" && lessonId.trim().length > 0;
  const isNewLesson =
    typeof sectionId === "string" &&
    sectionId.trim().length > 0 &&
    typeof newLessonTitle === "string" &&
    newLessonTitle.trim().length > 0;

  if (!isExistingLesson && !isNewLesson) {
    return data(
      "Invalid request: provide lessonId or sectionId + newLessonTitle",
      { status: 400 }
    );
  }

  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const courseWrite = yield* CourseWriteService;
    const fs = yield* FileSystem.FileSystem;

    // Validate video exists and is standalone
    const video = yield* db.getVideoById(videoId);
    if (video.lessonId !== null) {
      return yield* Effect.die(
        data("Video is already attached to a lesson", { status: 400 })
      );
    }

    // Determine target lesson ID
    let targetLessonId: string;

    if (isExistingLesson) {
      targetLessonId = (lessonId as string).trim();
    } else {
      // Create new lesson: ghost first, then materialize to make it real
      const { lessonId: ghostLessonId } = yield* courseWrite.addGhostLesson(
        (sectionId as string).trim(),
        (newLessonTitle as string).trim()
      );
      yield* courseWrite.materializeGhost(ghostLessonId);
      targetLessonId = ghostLessonId;
    }

    // Get the target lesson's full filesystem path
    const lesson = yield* db.getLessonWithHierarchyById(targetLessonId);
    const repoPath = lesson.section.repoVersion.repo.filePath;
    const sectionPath = lesson.section.path;
    const lessonDirName = lesson.path;
    const lessonDir = path.join(repoPath, sectionPath, lessonDirName);

    // Get standalone video file directory
    const standaloneDir = getStandaloneVideoFilePath(videoId);

    // Check if the standalone dir exists — it may not if no files were ever added
    const standaloneDirExists = yield* fs.exists(standaloneDir);

    if (standaloneDirExists) {
      // List files in the standalone video directory
      const standaloneFiles = yield* fs.readDirectory(standaloneDir);

      if (standaloneFiles.length > 0) {
        // Ensure lesson dir exists
        yield* fs.makeDirectory(lessonDir, { recursive: true });

        // Build set of existing files in the lesson dir for conflict detection
        const existingLessonFiles = new Set<string>(
          yield* fs
            .readDirectory(lessonDir)
            .pipe(Effect.catchAll(() => Effect.succeed([] as string[])))
        );

        // Copy each file to lesson directory with conflict resolution
        for (const filename of standaloneFiles) {
          const srcPath = path.join(standaloneDir, filename);

          // Skip directories (only copy files)
          const stat = yield* fs.stat(srcPath);
          if (stat.type === "Directory") continue;

          const destFilename = resolveDestFilename(
            existingLessonFiles,
            filename
          );
          const destPath = path.join(lessonDir, destFilename);

          const fileContent = yield* fs.readFile(srcPath);
          yield* fs.writeFile(destPath, fileContent);

          // Track newly added files to handle multiple conflicts in the same batch
          existingLessonFiles.add(destFilename);
        }
      }
    }

    // Update video's lessonId to attach it to the target lesson
    yield* db.updateVideoLesson({ videoId, lessonId: targetLessonId });

    return { success: true };
  }).pipe(
    withDatabaseDump,
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("NotFoundError", () => {
      return Effect.die(data("Not found", { status: 404 }));
    }),
    Effect.catchTag("RepoSyncError", (e) => {
      return Effect.die(data(e.message, { status: 409 }));
    }),
    Effect.catchTag("CourseWriteError", (e) => {
      return Effect.die(data(e.message, { status: 400 }));
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
