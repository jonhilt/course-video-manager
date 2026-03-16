import { Effect } from "effect";
import { FileSystem } from "@effect/platform";
import path from "node:path";

type DbSection = {
  id: string;
  path: string;
  lessons: DbLesson[];
};

type DbLesson = {
  id: string;
  path: string;
  videos: DbVideo[];
};

type DbVideo = {
  id: string;
  path: string;
};

type FileSystemSection = {
  sectionPathWithNumber: string;
  lessons: {
    lessonPathWithNumber: string;
  }[];
};

export type ResolvedVideo = {
  id: string;
  absolutePath: string;
  name: string;
};

export type ResolvedLesson = {
  id: string;
  path: string;
  videos: ResolvedVideo[];
};

export type ResolvedSection = {
  id: string;
  path: string;
  lessons: ResolvedLesson[];
};

export type MissingVideo = {
  videoId: string;
  videoPath: string;
  lessonPath: string;
};

export type ResolveResult = {
  sections: ResolvedSection[];
  missingVideos: MissingVideo[];
};

/**
 * Resolves sections from the DB and file system, checking which videos
 * exist locally. Videos that don't exist are collected in `missingVideos`
 * instead of causing a failure.
 */
export const resolveSectionsWithVideos = (opts: {
  sectionsOnFileSystem: FileSystemSection[];
  sectionsInDb: DbSection[];
  finishedVideosDirectory: string;
  videoPathOverrides?: Map<string, string>;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const sections: ResolvedSection[] = [];
    const missingVideos: MissingVideo[] = [];

    for (const sectionOnFileSystem of opts.sectionsOnFileSystem) {
      const sectionInDb = opts.sectionsInDb.find(
        (s) => s.path === sectionOnFileSystem.sectionPathWithNumber
      );

      if (!sectionInDb) {
        continue;
      }

      const lessons: ResolvedLesson[] = [];

      for (const lesson of sectionOnFileSystem.lessons) {
        const lessonInDb = sectionInDb.lessons.find(
          (l) => l.path === lesson.lessonPathWithNumber
        );

        if (!lessonInDb) {
          continue;
        }

        const videos: ResolvedVideo[] = [];

        for (const video of lessonInDb.videos) {
          const absolutePath =
            opts.videoPathOverrides?.get(video.id) ??
            path.join(opts.finishedVideosDirectory, video.id + ".mp4");

          if (yield* fs.exists(absolutePath)) {
            videos.push({
              id: video.id,
              absolutePath,
              name: video.path,
            });
          } else {
            missingVideos.push({
              videoId: video.id,
              videoPath: video.path,
              lessonPath: lesson.lessonPathWithNumber,
            });
          }
        }

        lessons.push({
          id: lessonInDb.id,
          path: lessonInDb.path,
          videos,
        });
      }

      sections.push({
        id: sectionInDb.id,
        path: sectionInDb.path,
        lessons,
      });
    }

    return { sections, missingVideos };
  });
