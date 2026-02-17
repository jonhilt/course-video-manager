import { Effect, Schema } from "effect";
import type { Route } from "./+types/api.repos.$repoId.clear-video-files";
import { DBFunctionsService } from "@/services/db-service";
import { runtimeLive } from "@/services/layer";
import { FileSystem } from "@effect/platform";
import { getVideoPath } from "@/lib/get-video";

const clearVideoFilesSchema = Schema.Struct({
  versionId: Schema.String.pipe(Schema.minLength(1)),
});

export const action = async (args: Route.ActionArgs) => {
  const formData = await args.request.formData();
  const formDataObject = Object.fromEntries(formData);

  return Effect.gen(function* () {
    const { versionId } = yield* Schema.decodeUnknown(clearVideoFilesSchema)(
      formDataObject
    );

    const db = yield* DBFunctionsService;
    const fs = yield* FileSystem.FileSystem;

    const videoIds = yield* db.getVideoIdsForVersion(versionId);

    let deletedCount = 0;
    for (const videoId of videoIds) {
      const videoPath = getVideoPath(videoId);
      const exists = yield* fs.exists(videoPath);
      if (exists) {
        yield* fs.remove(videoPath);
        deletedCount++;
      }
    }

    return { success: true, deletedCount, totalVideos: videoIds.length };
  }).pipe(
    Effect.catchAll((error) =>
      Effect.succeed({
        success: false,
        error: `Failed to clear video files: ${error}`,
      })
    ),
    runtimeLive.runPromise
  );
};
