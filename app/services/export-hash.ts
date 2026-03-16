import crypto from "node:crypto";
import path from "node:path";
import { Config, Effect } from "effect";
import { FileSystem } from "@effect/platform";
import { DBFunctionsService } from "@/services/db-service.server";

/**
 * Bump this constant to force re-export of all videos (e.g., after changing
 * ffmpeg settings). All existing hashes become invalid.
 */
export const EXPORT_VERSION = 1;

export type ExportClip = {
  videoFilename: string;
  sourceStartTime: number;
  sourceEndTime: number;
  order: string;
};

/**
 * Compute the content-addressed export hash for a set of clips.
 * Returns null if there are no clips (not a real video).
 *
 * Hash is deterministic: clips are sorted by their `order` field,
 * and only video-affecting fields are included (not transcript text).
 */
export const computeExportHash = (clips: ExportClip[]): string | null => {
  if (clips.length === 0) return null;

  const sorted = [...clips].sort((a, b) =>
    a.order < b.order ? -1 : a.order > b.order ? 1 : 0
  );

  const payload = {
    v: EXPORT_VERSION,
    clips: sorted.map((c) => ({
      f: c.videoFilename,
      s: c.sourceStartTime,
      e: c.sourceEndTime,
    })),
  };

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 32);
};

/**
 * Build the filename for a content-addressed export: `{courseId}-{hash}.mp4`
 */
export const exportFilename = (courseId: string, hash: string): string =>
  `${courseId}-${hash}.mp4`;

/**
 * Resolve the absolute path where an exported video lives (or would live).
 */
export const resolveExportPath = (
  finishedVideosDir: string,
  courseId: string,
  hash: string
): string => path.join(finishedVideosDir, exportFilename(courseId, hash));

/**
 * Check whether a file with the matching export hash exists on disk.
 */
export const isExported = (
  finishedVideosDir: string,
  courseId: string,
  clips: ExportClip[]
) =>
  Effect.gen(function* () {
    const hash = computeExportHash(clips);
    if (!hash) return false;

    const fs = yield* FileSystem.FileSystem;
    const filePath = resolveExportPath(finishedVideosDir, courseId, hash);
    return yield* fs.exists(filePath);
  });

/**
 * Garbage-collect stale exported files for a course.
 *
 * Collects all valid hashes across all versions in the DB, then deletes any
 * `{courseId}-*.mp4` files in the finished videos directory whose hash is not
 * in that set.
 *
 * Returns the list of deleted file paths.
 */
export const garbageCollect = (courseId: string) =>
  Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const fs = yield* FileSystem.FileSystem;
    const finishedVideosDir = yield* Config.string("FINISHED_VIDEOS_DIRECTORY");

    // Collect all valid hashes across all versions.
    // getCourseVersions returns version metadata; we fetch each with full
    // clip data via getVersionWithSections to compute hashes.
    const versionsMeta = yield* db.getCourseVersions(courseId);
    const allValidHashes = new Set<string>();

    for (const meta of versionsMeta) {
      const version = yield* db.getVersionWithSections(meta.id);
      for (const section of version.sections) {
        for (const lesson of section.lessons) {
          for (const video of lesson.videos) {
            const hash = computeExportHash(video.clips);
            if (hash) allValidHashes.add(hash);
          }
        }
      }
    }

    // List all {courseId}-*.mp4 files in the finished videos directory
    const prefix = `${courseId}-`;
    const suffix = ".mp4";
    const dirExists = yield* fs.exists(finishedVideosDir);
    if (!dirExists) return [];

    const allFiles = yield* fs.readDirectory(finishedVideosDir);
    const courseFiles = allFiles.filter(
      (f) => f.startsWith(prefix) && f.endsWith(suffix)
    );

    // Delete files whose hash is not in the valid set
    const deleted: string[] = [];
    for (const file of courseFiles) {
      const hash = file.slice(prefix.length, -suffix.length);
      if (!allValidHashes.has(hash)) {
        const filePath = path.join(finishedVideosDir, file);
        yield* fs.remove(filePath);
        deleted.push(filePath);
      }
    }

    return deleted;
  });
