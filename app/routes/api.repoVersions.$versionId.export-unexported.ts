import { Config, Console, Effect } from "effect";
import { FileSystem } from "@effect/platform";
import { DBFunctionsService } from "@/services/db-service";
import { runtimeLive } from "@/services/layer";
import type { Route } from "./+types/api.repoVersions.$versionId.export-unexported";
import {
  TotalTypeScriptCLIService,
  type BeatType,
} from "@/services/tt-cli-service";
import {
  FINAL_VIDEO_PADDING,
  BEAT_DURATION,
} from "@/features/video-editor/constants";
import { withDatabaseDump } from "@/services/dump-service";
import path from "node:path";
import { data } from "react-router";

export const action = async (args: Route.ActionArgs) => {
  const { versionId } = args.params;

  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const ttCliService = yield* TotalTypeScriptCLIService;
    const fs = yield* FileSystem.FileSystem;
    const FINISHED_VIDEOS_DIRECTORY = yield* Config.string(
      "FINISHED_VIDEOS_DIRECTORY"
    );

    const version = yield* db.getVersionWithSections(versionId);

    // Collect all videos with clips that haven't been exported yet
    const videosToExport: Array<{
      id: string;
      clips: Array<{
        videoFilename: string;
        sourceStartTime: number;
        sourceEndTime: number;
        beatType: string;
      }>;
    }> = [];

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
              videosToExport.push({
                id: video.id,
                clips: video.clips,
              });
            }
          }
        }
      }
    }

    // Export videos sequentially
    for (const video of videosToExport) {
      const result = yield* ttCliService.exportVideoClips({
        videoId: video.id,
        shortsDirectoryOutputName: undefined,
        clips: video.clips.map((clip, index, array) => {
          const isFinalClip = index === array.length - 1;
          const beatDuration = clip.beatType === "long" ? BEAT_DURATION : 0;
          return {
            inputVideo: clip.videoFilename,
            startTime: clip.sourceStartTime,
            duration:
              clip.sourceEndTime -
              clip.sourceStartTime +
              beatDuration +
              (isFinalClip ? FINAL_VIDEO_PADDING : 0),
            beatType: clip.beatType as BeatType,
          };
        }),
      });

      yield* Console.log(
        `Exported video ${video.id}: ${JSON.stringify(result)}`
      );
    }

    return { success: true, exportedCount: videosToExport.length };
  }).pipe(
    withDatabaseDump,
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("NotFoundError", () => {
      return Effect.die(data("Version not found", { status: 404 }));
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
