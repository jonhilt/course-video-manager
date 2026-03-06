import { Console, Effect, Schema } from "effect";
import type { Route } from "./+types/api.sections.reorder";
import { DBFunctionsService } from "@/services/db-service.server";
import { runtimeLive } from "@/services/layer.server";
import { withDatabaseDump } from "@/services/dump-service";
import { data } from "react-router";

const reorderSchema = Schema.Struct({
  repoVersionId: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Repo version ID is required" })
  ),
  sectionIds: Schema.transform(Schema.String, Schema.Array(Schema.String), {
    decode: (s) => JSON.parse(s) as string[],
    encode: (a) => JSON.stringify(a),
  }),
});

export const action = async (args: Route.ActionArgs) => {
  const formData = await args.request.formData();
  const formDataObject = Object.fromEntries(formData);

  return Effect.gen(function* () {
    const { sectionIds } =
      yield* Schema.decodeUnknown(reorderSchema)(formDataObject);

    const db = yield* DBFunctionsService;

    // Update the order field for each section based on its position in the array
    for (let i = 0; i < sectionIds.length; i++) {
      yield* db.updateSectionOrder(sectionIds[i]!, i);
    }

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
