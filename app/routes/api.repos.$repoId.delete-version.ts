import { Effect, Schema } from "effect";
import type { Route } from "./+types/api.repos.$repoId.delete-version";
import { DBFunctionsService } from "@/services/db-service";
import { runtimeLive } from "@/services/layer";
import { withDatabaseDump } from "@/services/dump-service";

const deleteVersionSchema = Schema.Struct({
  versionId: Schema.String.pipe(Schema.minLength(1)),
});

export const action = async (args: Route.ActionArgs) => {
  const formData = await args.request.formData();
  const formDataObject = Object.fromEntries(formData);

  return Effect.gen(function* () {
    const { versionId } =
      yield* Schema.decodeUnknown(deleteVersionSchema)(formDataObject);

    const db = yield* DBFunctionsService;

    const newLatestVersion = yield* db.deleteRepoVersion(versionId);

    return { success: true, newLatestVersionId: newLatestVersion?.id };
  }).pipe(
    Effect.catchTag("CannotDeleteOnlyVersionError", () =>
      Effect.succeed({
        success: false,
        error: "Cannot delete the only version of a repository",
      })
    ),
    Effect.catchTag("CannotDeleteNonLatestVersionError", () =>
      Effect.succeed({
        success: false,
        error: "Can only delete the latest version",
      })
    ),
    Effect.catchTag("NotFoundError", () =>
      Effect.succeed({
        success: false,
        error: "Version not found",
      })
    ),
    withDatabaseDump,
    runtimeLive.runPromise
  );
};
