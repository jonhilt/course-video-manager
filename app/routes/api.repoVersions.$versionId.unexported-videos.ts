import { Config, Effect } from "effect";
import { FileSystem } from "@effect/platform";
import { DBFunctionsService } from "@/services/db-service";
import { runtimeLive } from "@/services/layer";
import type { Route } from "./+types/api.repoVersions.$versionId.unexported-videos";
import { data } from "react-router";
import path from "node:path";

export const action = async (args: Route.ActionArgs) => {
  const { versionId } = args.params;

  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const fs = yield* FileSystem.FileSystem;
    const FINISHED_VIDEOS_DIRECTORY = yield* Config.string(
      "FINISHED_VIDEOS_DIRECTORY"
    );

    const version = yield* db.getVersionWithSections(versionId);

    const unexportedVideos: Array<{ id: string; title: string }> = [];

    for (const section of version.sections) {
      for (const lesson of section.lessons) {
        for (const video of lesson.videos) {
          if (video.clips.length > 0) {
            const exportedVideoPath = path.join(
              FINISHED_VIDEOS_DIRECTORY,
              `${video.id}.mp4`
            );
            const exists = yield* fs.exists(exportedVideoPath);

            if (!exists) {
              unexportedVideos.push({
                id: video.id,
                title: `${section.path}/${lesson.path}/${video.path}`,
              });
            }
          }
        }
      }
    }

    return { videos: unexportedVideos };
  }).pipe(
    Effect.catchTag("NotFoundError", () => {
      return Effect.die(data("Version not found", { status: 404 }));
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
