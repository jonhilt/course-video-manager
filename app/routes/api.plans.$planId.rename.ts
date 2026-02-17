import { Console, Effect, Schema } from "effect";
import type { Route } from "./+types/api.plans.$planId.rename";
import { DBFunctionsService } from "@/services/db-service";
import { runtimeLive } from "@/services/layer";
import { data } from "react-router";

const RenamePlanSchema = Schema.Struct({
  title: Schema.String,
});

export const action = async (args: Route.ActionArgs) => {
  const planId = args.params.planId;
  const formData = await args.request.formData();
  const title = formData.get("title");

  return Effect.gen(function* () {
    const parsed = yield* Schema.decodeUnknown(RenamePlanSchema)({ title });
    const db = yield* DBFunctionsService;
    yield* db.renamePlan(planId, parsed.title);

    return { success: true };
  }).pipe(
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
