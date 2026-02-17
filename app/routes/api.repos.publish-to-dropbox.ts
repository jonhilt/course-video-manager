import { RepoParserService } from "@/services/repo-parser";
import type { Route } from "./+types/api.repos.add";
import {
  Array,
  Config,
  ConfigProvider,
  Console,
  Data,
  Effect,
  flow,
  Schema,
} from "effect";
import { runtimeLive } from "@/services/layer";
import { DBFunctionsService } from "@/services/db-service";
import { Command, FileSystem } from "@effect/platform";
import path from "node:path";
import { makeSemaphore } from "effect/Effect";
import { generateChangelog } from "@/services/changelog-service";
import { data } from "react-router";

const publishRepoSchema = Schema.Struct({
  repoId: Schema.String,
});

class DoesNotExistOnDbError extends Data.TaggedError("DoesNotExistOnDbError")<{
  type: "section" | "lesson";
  path: string;
  message: string;
}> {}

class FailedToDeleteEmptyDirectoriesError extends Data.TaggedError(
  "FailedToDeleteEmptyDirectoriesError"
)<{
  exitCode: number;
}> {}

type Section = {
  id: string;
  path: string;
  lessons: Lesson[];
};

type Lesson = {
  id: string;
  path: string;
  videos: Video[];
};

type Video = {
  id: string;
  absolutePath: string;
  name: string;
};

class VideoDoesNotExistLocallyError extends Data.TaggedError(
  "VideoDoesNotExistLocallyError"
)<{
  type: "video";
  path: string;
  message: string;
}> {}

const ALLOWED_FILE_EXTENSIONS_FROM_REPO = [
  ".ts",
  ".tsx",
  ".json",
  ".txt",
  ".md",
  ".mp4",
];

export const action = async ({ request }: Route.ActionArgs) => {
  const formData = await request.formData();
  const formDataObject = Object.fromEntries(formData);

  return Effect.gen(function* () {
    const result =
      yield* Schema.decodeUnknown(publishRepoSchema)(formDataObject);

    const copyFileToDropboxSemaphore = yield* makeSemaphore(20);

    const fs = yield* FileSystem.FileSystem;

    const DROPBOX_PATH = yield* Config.string("DROPBOX_PATH");
    const FINISHED_VIDEOS_DIRECTORY = yield* Config.string(
      "FINISHED_VIDEOS_DIRECTORY"
    );

    const repoParserService = yield* RepoParserService;
    const db = yield* DBFunctionsService;

    // Get the latest version - only publish sections from the latest version
    const latestVersion = yield* db.getLatestRepoVersion(result.repoId);

    if (!latestVersion) {
      return yield* new DoesNotExistOnDbError({
        type: "section",
        path: "",
        message: `No version found for repo ${result.repoId}`,
      });
    }

    const repoWithSections = yield* db.getRepoWithSectionsByVersion({
      repoId: result.repoId,
      versionId: latestVersion.id,
    });

    const sectionsOnFileSystem = yield* repoParserService.parseRepo(
      repoWithSections.filePath
    );

    const sections: Section[] = [];

    for (const sectionOnFileSystem of sectionsOnFileSystem) {
      const sectionInDb = repoWithSections.sections.find(
        (s) => s.path === sectionOnFileSystem.sectionPathWithNumber
      );

      if (!sectionInDb) {
        return yield* new DoesNotExistOnDbError({
          type: "section",
          path: sectionOnFileSystem.sectionPathWithNumber,
          message: `Section ${sectionOnFileSystem.sectionPathWithNumber} does not exist on the database`,
        });
      }

      const lessons: Lesson[] = [];

      for (const lesson of sectionOnFileSystem.lessons) {
        const lessonInDb = sectionInDb.lessons.find(
          (l) => l.path === lesson.lessonPathWithNumber
        );

        if (!lessonInDb) {
          return yield* new DoesNotExistOnDbError({
            type: "lesson",
            path: lesson.lessonPathWithNumber,
            message: `Lesson ${lesson.lessonPathWithNumber} does not exist on the database`,
          });
        }

        const videos: Video[] = [];

        for (const video of lessonInDb.videos) {
          const absolutePath = path.join(
            FINISHED_VIDEOS_DIRECTORY,
            video.id + ".mp4"
          );

          if (!(yield* fs.exists(absolutePath))) {
            return yield* new VideoDoesNotExistLocallyError({
              type: "video",
              path: video.id,
              message: `Video ${lesson.lessonPathWithNumber}/${video.path} does not exist locally`,
            });
          }

          videos.push({
            id: video.id,
            absolutePath,
            name: video.path,
          });
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

    yield* Effect.logDebug("Validation complete");

    const dropboxRepoDirectory = path.join(DROPBOX_PATH, repoWithSections.name);

    // All the files that are supposed to be in the dropbox.
    // Used to delete files from the dropbox that are not in the repo.
    const filesSupposedToBeInDropbox = new Set<string>();

    const copyFileToDropbox = Effect.fn("copyFileToDropbox")(function* (opts: {
      fromPath: string;
      toPath: string;
    }) {
      yield* copyFileToDropboxSemaphore.withPermits(1)(
        Effect.fork(
          Effect.gen(function* () {
            yield* fs.makeDirectory(path.dirname(opts.toPath), {
              recursive: true,
            });

            // If the original file exists...
            if (yield* fs.exists(opts.toPath)) {
              const toPathStats = yield* fs.stat(opts.toPath);
              const fromPathStats = yield* fs.stat(opts.fromPath);

              // ...and the size is the same...
              if (toPathStats.size === fromPathStats.size) {
                // ...do nothing, the file is the same.
                return;
              }
            }

            yield* fs.copyFile(opts.fromPath, opts.toPath);
          })
        )
      );

      filesSupposedToBeInDropbox.add(opts.toPath);
    });

    for (const section of sections) {
      const dropboxSectionDirectory = path.join(
        dropboxRepoDirectory,
        section.path
      );

      for (const lesson of section.lessons) {
        const dropboxLessonDirectory = path.join(
          dropboxSectionDirectory,
          lesson.path
        );

        yield* fs.makeDirectory(dropboxLessonDirectory, { recursive: true });

        const lessonVideos = lesson.videos;

        for (const video of lessonVideos) {
          const extName = path.extname(video.absolutePath);
          yield* copyFileToDropbox({
            fromPath: video.absolutePath,
            toPath: path.join(
              dropboxLessonDirectory,
              `${video.name}${extName}`
            ),
          });
        }

        const lessonDirectoryOnFileSystem = path.join(
          repoWithSections.filePath,
          section.path,
          lesson.path
        );

        const filesInLessonDirectory = yield* fs
          .readDirectory(lessonDirectoryOnFileSystem, { recursive: true })
          .pipe(
            Effect.map(
              flow(
                Array.filter((file) => {
                  return (
                    ALLOWED_FILE_EXTENSIONS_FROM_REPO.includes(
                      path.extname(file)
                    ) && !file.includes("node_modules")
                  );
                }),
                Array.map((file) => {
                  return {
                    fromPath: path.join(lessonDirectoryOnFileSystem, file),
                    toPath: path.join(dropboxLessonDirectory, file),
                  };
                })
              )
            )
          );

        yield* Effect.forEach(filesInLessonDirectory, copyFileToDropbox, {
          concurrency: "unbounded",
        });
      }
    }

    const allFilesInOurDropbox = yield* fs
      .readDirectory(dropboxRepoDirectory, {
        recursive: true,
      })
      .pipe(
        Effect.map(
          flow(
            Array.filter((file) => {
              return ALLOWED_FILE_EXTENSIONS_FROM_REPO.includes(
                path.extname(file)
              );
            }),
            // Map to absolute paths
            Array.map((file) => path.join(dropboxRepoDirectory, file))
          )
        )
      );

    const filesToDelete = allFilesInOurDropbox.filter(
      (file) => !filesSupposedToBeInDropbox.has(file)
    );

    yield* Effect.forEach(filesToDelete, (file) => fs.remove(file));

    // Generate and write changelog
    const allVersions = yield* db.getAllVersionsWithStructure(result.repoId);
    const changelogContent = generateChangelog(allVersions);
    const changelogPath = path.join(dropboxRepoDirectory, "changelog.md");
    yield* fs.writeFileString(changelogPath, changelogContent);

    const exitCode = yield* Command.make(
      `find`,
      dropboxRepoDirectory,
      "-type",
      "d",
      "-empty",
      "-delete"
    ).pipe(
      Command.stdout("inherit"),
      Command.stderr("inherit"),
      Command.exitCode
    );

    if (exitCode !== 0) {
      return yield* new FailedToDeleteEmptyDirectoriesError({
        exitCode,
      });
    }

    return {};
  }).pipe(
    Effect.tapErrorCause((e) => {
      return Console.log(e);
    }),
    Effect.catchTags({
      ParseError: (_e) => Effect.die(data("Invalid request", { status: 400 })),
      RepoDoesNotExistError: () =>
        Effect.die(data("Repo path does not exist locally", { status: 404 })),
      VideoDoesNotExistLocallyError: (e) =>
        Effect.die(data(e.message, { status: 404 })),
      DoesNotExistOnDbError: (e) =>
        Effect.die(
          data(
            JSON.stringify({
              message: e.message,
              type: e.type,
              path: e.path,
            }),
            { status: 400 }
          )
        ),
      NotFoundError: (e) =>
        Effect.die(data(`Not found: ${e.message}`, { status: 404 })),
    }),
    Effect.withConfigProvider(ConfigProvider.fromEnv()),
    Effect.catchAll((_e) => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
