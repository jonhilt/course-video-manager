import { Console, Effect, Array as EffectArray } from "effect";
import type { Route } from "./+types/api.videos.$videoId.source-project-files";
import { DBFunctionsService } from "@/services/db-service.server";
import { runtimeLive } from "@/services/layer.server";
import { FileSystem } from "@effect/platform";
import { data } from "react-router";
import path from "path";
import {
  SOURCE_PROJECT_EXCLUDED_DIRECTORIES,
  DEFAULT_CHECKED_EXTENSIONS,
} from "@/services/text-writing-agent";

export const loader = async (args: Route.LoaderArgs) => {
  const { videoId } = args.params;

  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const fs = yield* FileSystem.FileSystem;

    const video = yield* db.getVideoWithClipsById(videoId);
    const sourceProjectPath = video.sourceProjectPath;

    if (!sourceProjectPath) {
      return { files: [] };
    }

    const dirExists = yield* fs.exists(sourceProjectPath);
    if (!dirExists) {
      return { files: [] };
    }

    const allFiles = yield* fs
      .readDirectory(sourceProjectPath, { recursive: true })
      .pipe(
        Effect.map((files) =>
          files.filter(
            (file) =>
              !SOURCE_PROJECT_EXCLUDED_DIRECTORIES.some((dir) =>
                file.includes(dir + "/")
              )
          )
        )
      );

    const filesWithMetadata = yield* Effect.forEach(
      allFiles,
      (relativePath) => {
        return Effect.gen(function* () {
          const fullPath = path.join(sourceProjectPath, relativePath);
          const stat = yield* fs.stat(fullPath);
          if (stat.type !== "File") return null;
          const extension = path.extname(relativePath).slice(1);
          const defaultEnabled = DEFAULT_CHECKED_EXTENSIONS.includes(extension);
          return {
            path: relativePath,
            size: Number(stat.size),
            defaultEnabled,
          };
        });
      }
    ).pipe(Effect.map(EffectArray.filter((f) => f !== null)));

    return { files: filesWithMetadata };
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("NotFoundError", () => {
      return Effect.die(data("Video not found", { status: 404 }));
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
