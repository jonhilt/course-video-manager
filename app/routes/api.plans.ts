import { Console, Effect, Schema } from "effect";
import type { Route } from "./+types/api.plans";
import { runtimeLive } from "@/services/layer";
import { data, redirect } from "react-router";
import { DBFunctionsService } from "@/services/db-service";

const CreatePlanSchema = Schema.Struct({
  title: Schema.String,
});

export const loader = async (_args: Route.LoaderArgs) => {
  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const plans = yield* db.getPlans();

    return { plans };
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};

export const action = async (args: Route.ActionArgs) => {
  const formData = await args.request.formData();
  const title = formData.get("title");

  return Effect.gen(function* () {
    const parsed = yield* Schema.decodeUnknown(CreatePlanSchema)({
      title,
    });

    const db = yield* DBFunctionsService;
    const now = new Date().toISOString();
    const planId = crypto.randomUUID();

    // Use syncPlan to create the new plan in the database
    yield* db.syncPlan({
      id: planId,
      title: parsed.title,
      createdAt: now,
      updatedAt: now,
      sections: [],
    });

    // Redirect to the new plan
    return redirect(`/plans/${planId}`);
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("ParseError", (e) => {
      return Effect.die(data("Invalid request: " + e.message, { status: 400 }));
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
