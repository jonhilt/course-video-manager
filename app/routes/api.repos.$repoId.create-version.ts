import { DBFunctionsService } from "@/services/db-service";
import { withDatabaseDump } from "@/services/dump-service";
import { runtimeLive } from "@/services/layer";
import { Config, Console, Effect, Schema } from "effect";
import { FileSystem } from "@effect/platform";
import type { Route } from "./+types/api.repos.$repoId.create-version";
import path from "node:path";
import { data } from "react-router";

const createVersionSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  sourceVersionId: Schema.String,
});

export const action = async ({ request, params }: Route.ActionArgs) => {
  const formData = await request.formData();
  const formDataObject = Object.fromEntries(formData);

  return await Effect.gen(function* () {
    const result =
      yield* Schema.decodeUnknown(createVersionSchema)(formDataObject);
    const db = yield* DBFunctionsService;
    const fs = yield* FileSystem.FileSystem;
    const FINISHED_VIDEOS_DIRECTORY = yield* Config.string(
      "FINISHED_VIDEOS_DIRECTORY"
    );

    const { version: newVersion, videoIdMappings } =
      yield* db.copyVersionStructure({
        sourceVersionId: result.sourceVersionId,
        repoId: params.repoId,
        newVersionName: result.name,
      });

    // Move video files from old version IDs to new version IDs
    for (const mapping of videoIdMappings) {
      const sourceVideoPath = path.join(
        FINISHED_VIDEOS_DIRECTORY,
        `${mapping.sourceVideoId}.mp4`
      );
      const newVideoPath = path.join(
        FINISHED_VIDEOS_DIRECTORY,
        `${mapping.newVideoId}.mp4`
      );

      // Check if source video file exists
      const exists = yield* fs.exists(sourceVideoPath);
      if (exists) {
        // Rename/move the file to new video ID
        yield* fs.rename(sourceVideoPath, newVideoPath);
        yield* Console.log(
          `Moved video file: ${mapping.sourceVideoId}.mp4 -> ${mapping.newVideoId}.mp4`
        );
      }
    }

    return { id: newVersion.id, name: newVersion.name };
  }).pipe(
    withDatabaseDump,
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("ParseError", () =>
      Effect.die(
        data("Invalid request - version name required", { status: 400 })
      )
    ),
    Effect.catchTag("NotLatestVersionError", () =>
      Effect.die(
        data("Can only create new version from latest version", { status: 400 })
      )
    ),
    Effect.catchAll(() =>
      Effect.die(data("Internal server error", { status: 500 }))
    ),
    runtimeLive.runPromise
  );
};
