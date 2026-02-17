import { DBFunctionsService } from "@/services/db-service";
import { Console, Effect } from "effect";
import type { Route } from "./+types/clips.$clipId.first-frame";
import { runtimeLive } from "@/services/layer";
import { TotalTypeScriptCLIService } from "@/services/tt-cli-service";
import { createReadStream } from "fs";
import { data } from "react-router";

export const loader = async (args: Route.LoaderArgs) => {
  const { clipId } = args.params;
  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const clip = yield* db.getClipById(clipId);

    const inputVideo = clip.videoFilename;

    const seekTo = clip.sourceStartTime;

    const ttCliService = yield* TotalTypeScriptCLIService;

    const firstFramePath = yield* ttCliService.getFirstFrame(
      inputVideo,
      seekTo
    );

    const firstFrameReadStream = createReadStream(firstFramePath);

    return new Response(firstFrameReadStream as any, {
      headers: {
        "Content-Type": "image/png",
      },
    });
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("NotFoundError", () => {
      return Effect.die(data("Clip not found", { status: 404 }));
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
