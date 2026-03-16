import { Console, Effect, Schema } from "effect";
import type { Route } from "./+types/api.videos.$videoId.move-to-course";
import { DBFunctionsService } from "@/services/db-service.server";
import { runtimeLive } from "@/services/layer.server";
import { withDatabaseDump } from "@/services/dump-service";
import { getStandaloneVideoFilePath } from "@/services/standalone-video-files";
import { data } from "react-router";
import { FileSystem } from "@effect/platform";
import path from "path";

const moveToCourseSchema = Schema.Struct({
  sectionId: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Section ID is required" })
  ),
  lessonId: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Lesson ID is required" })
  ),
  newLessonPath: Schema.optional(Schema.String),
});

/**
 * Finds an available filename in a directory by suffixing with " copy", " copy 2", etc.
 * Returns the filename unchanged if it doesn't exist.
 */
const findAvailableFilename = (dir: string, filename: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const originalPath = path.join(dir, filename);
    const originalExists = yield* fs.exists(originalPath);
    if (!originalExists) return filename;

    const ext = path.extname(filename);
    const base = path.basename(filename, ext);

    // Try "base copy.ext"
    const copyName = `${base} copy${ext}`;
    const copyPath = path.join(dir, copyName);
    const copyExists = yield* fs.exists(copyPath);
    if (!copyExists) return copyName;

    // Try "base copy 2.ext", "base copy 3.ext", etc.
    let counter = 2;
    let found = false;
    let resultName = copyName;
    while (!found) {
      const numberedName = `${base} copy ${counter}${ext}`;
      const numberedPath = path.join(dir, numberedName);
      const numberedExists = yield* fs.exists(numberedPath);
      if (!numberedExists) {
        resultName = numberedName;
        found = true;
      } else {
        counter++;
      }
    }
    return resultName;
  });

export const action = async (args: Route.ActionArgs) => {
  const formData = await args.request.formData();
  const formDataObject = Object.fromEntries(formData);
  const videoId = args.params.videoId;

  return Effect.gen(function* () {
    const { sectionId, lessonId, newLessonPath } =
      yield* Schema.decodeUnknown(moveToCourseSchema)(formDataObject);

    const db = yield* DBFunctionsService;
    const fs = yield* FileSystem.FileSystem;

    let targetLessonId: string;

    if (lessonId === "__new__") {
      if (!newLessonPath || newLessonPath.trim() === "") {
        return yield* Effect.die(
          data("New lesson path is required", { status: 400 })
        );
      }

      // Get all lessons in section to determine the next order value
      const lessonsInSection = yield* db.getLessonsBySectionId(sectionId);
      const maxOrder = lessonsInSection.reduce(
        (max, l) => Math.max(max, l.order),
        0
      );

      // Create new real lesson at end of section
      const newLessons = yield* db.createLessons(sectionId, [
        {
          lessonPathWithNumber: newLessonPath.trim(),
          lessonNumber: maxOrder + 1,
        },
      ]);

      const newLesson = newLessons[0];
      if (!newLesson) {
        return yield* Effect.die(
          data("Failed to create lesson", { status: 500 })
        );
      }
      targetLessonId = newLesson.id;
    } else {
      targetLessonId = lessonId;
    }

    // Get lesson with hierarchy to find directory path
    const lesson = yield* db.getLessonWithHierarchyById(targetLessonId);
    const repo = lesson.section.repoVersion.repo;
    const section = lesson.section;
    const lessonDir = path.join(repo.filePath, section.path, lesson.path);

    // Ensure lesson directory exists (needed for new lessons, safe for existing)
    yield* fs.makeDirectory(lessonDir, { recursive: true });

    // Get standalone video files directory
    const standaloneDir = getStandaloneVideoFilePath(videoId);
    const standaloneDirExists = yield* fs.exists(standaloneDir);

    if (standaloneDirExists) {
      const files = yield* fs.readDirectory(standaloneDir);

      yield* Effect.forEach(
        files,
        (filename) =>
          Effect.gen(function* () {
            const sourcePath = path.join(standaloneDir, filename);
            const stat = yield* fs.stat(sourcePath);

            // Only copy files, skip directories
            if (stat.type !== "File") return;

            const targetFilename = yield* findAvailableFilename(
              lessonDir,
              filename
            );
            const targetPath = path.join(lessonDir, targetFilename);

            yield* fs.copyFile(sourcePath, targetPath);
          }),
        { concurrency: 1 }
      );
    }

    // Update video's lessonId in database
    yield* db.updateVideoLesson({ videoId, lessonId: targetLessonId });

    return { success: true };
  }).pipe(
    withDatabaseDump,
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("ParseError", () => {
      return Effect.die(data("Invalid request", { status: 400 }));
    }),
    Effect.catchTag("NotFoundError", () => {
      return Effect.die(data("Not found", { status: 404 }));
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
