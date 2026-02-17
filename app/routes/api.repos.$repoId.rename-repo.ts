import { Console, Effect, Schema } from "effect";
import type { Route } from "./+types/api.repos.$repoId.rename-repo";
import { DBFunctionsService } from "@/services/db-service";
import { runtimeLive } from "@/services/layer";
import { withDatabaseDump } from "@/services/dump-service";
import { data } from "react-router";

const renameRepoSchema = Schema.Struct({
  name: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Course name cannot be empty" })
  ),
});

export const action = async (args: Route.ActionArgs) => {
  const formData = await args.request.formData();
  const formDataObject = Object.fromEntries(formData);
  const repoId = args.params.repoId;

  return Effect.gen(function* () {
    const { name } =
      yield* Schema.decodeUnknown(renameRepoSchema)(formDataObject);

    const db = yield* DBFunctionsService;

    yield* db.updateRepoName({ repoId, name: name.trim() });

    return { success: true };
  }).pipe(
    withDatabaseDump,
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("ParseError", () => {
      return Effect.die(data("Invalid request", { status: 400 }));
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
