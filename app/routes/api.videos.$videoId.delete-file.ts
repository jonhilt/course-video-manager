import { Console, Effect } from "effect";
import { FileSystem } from "@effect/platform";
import type { Route } from "./+types/api.videos.$videoId.delete-file";
import { runtimeLive } from "@/services/layer.server";
import { data } from "react-router";
import { getVideoPath } from "@/lib/get-video";

export const action = async (args: Route.ActionArgs) => {
  const videoId = args.params.videoId;

  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const videoPath = getVideoPath(videoId);

    const fileExists = yield* fs.exists(videoPath);
    if (!fileExists) {
      return yield* Effect.die(data("File not found", { status: 404 }));
    }

    yield* fs.remove(videoPath);

    return { success: true };
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchAll(() => {
      return Effect.die(data("Failed to delete file", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
