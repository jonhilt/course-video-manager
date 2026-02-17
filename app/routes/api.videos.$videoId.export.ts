import { Console, Effect, Schema } from "effect";
import { DBFunctionsService } from "@/services/db-service";
import { runtimeLive } from "@/services/layer";
import type { Route } from "./+types/api.videos.$videoId.export";
import {
  TotalTypeScriptCLIService,
  type BeatType,
} from "@/services/tt-cli-service";
import { FINAL_VIDEO_PADDING } from "@/features/video-editor/constants";
import { withDatabaseDump } from "@/services/dump-service";
import { data } from "react-router";

const exportVideoSchema = Schema.Struct({
  shortsDirectoryOutputName: Schema.optional(Schema.String),
});

export const action = async (args: Route.ActionArgs) => {
  const formData = await args.request.formData();
  const formDataObject = Object.fromEntries(formData);
  const { videoId } = args.params;

  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const ttCliService = yield* TotalTypeScriptCLIService;

    const { shortsDirectoryOutputName } =
      yield* Schema.decodeUnknown(exportVideoSchema)(formDataObject);

    const video = yield* db.getVideoWithClipsById(videoId);

    const clips = video.clips;

    const result = yield* ttCliService.exportVideoClips({
      shortsDirectoryOutputName,
      videoId: videoId,
      clips: clips.map((clip, index, array) => {
        const isFinalClip = index === array.length - 1;
        return {
          inputVideo: clip.videoFilename,
          startTime: clip.sourceStartTime,
          duration:
            clip.sourceEndTime -
            clip.sourceStartTime +
            (isFinalClip ? FINAL_VIDEO_PADDING : 0),
          beatType: clip.beatType as BeatType,
        };
      }),
    });

    yield* Console.log(result);

    return { success: true };
  }).pipe(
    withDatabaseDump,
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("ParseError", () => {
      return Effect.die(data("Invalid request", { status: 400 }));
    }),
    Effect.catchTag("NotFoundError", () => {
      return Effect.die(data("Video not found", { status: 404 }));
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
