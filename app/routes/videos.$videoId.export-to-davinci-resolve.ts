import { Console, Effect } from "effect";
import type { Route } from "./+types/videos.$videoId.export-to-davinci-resolve";
import { DBFunctionsService } from "@/services/db-service";
import { TotalTypeScriptCLIService } from "@/services/tt-cli-service";
import { runtimeLive } from "@/services/layer";
import { withDatabaseDump } from "@/services/dump-service";
import { data } from "react-router";

export const action = async (args: Route.ActionArgs) => {
  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const ttCli = yield* TotalTypeScriptCLIService;
    const { videoId } = args.params;

    const video = yield* db.getVideoWithClipsById(videoId, {
      withArchived: false,
    });

    const videoName = video.lesson
      ? [video.lesson.section.path, video.lesson.path, video.path].join(" - ")
      : video.path;

    const clips = video.clips;

    const output = yield* ttCli.sendClipsToDavinciResolve({
      clips: clips.map((clip) => ({
        inputVideo: clip.videoFilename,
        startTime: clip.sourceStartTime,
        duration: clip.sourceEndTime - clip.sourceStartTime,
      })),
      timelineName: videoName,
    });

    yield* Console.log(output);

    return {
      success: true,
    };
  }).pipe(
    withDatabaseDump,
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
