import { Console, Effect, Schema } from "effect";
import type { Route } from "./+types/api.plans.sync";
import { runtimeLive } from "@/services/layer";
import { data } from "react-router";
import { DBFunctionsService } from "@/services/db-service";

const PlanLessonSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  order: Schema.Number,
  description: Schema.optional(Schema.String),
  icon: Schema.optional(
    Schema.NullOr(Schema.Literal("watch", "code", "discussion"))
  ),
  status: Schema.optional(Schema.Literal("todo", "done", "maybe")),
  priority: Schema.optional(Schema.Literal(1, 2, 3)),
  dependencies: Schema.optional(Schema.Array(Schema.String)),
});

const PlanSectionSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  order: Schema.Number,
  lessons: Schema.Array(PlanLessonSchema),
});

const PlanSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  sections: Schema.Array(PlanSectionSchema),
});

const SyncRequestSchema = Schema.Struct({
  plan: PlanSchema,
});

export const action = async (args: Route.ActionArgs) => {
  const body = await args.request.json();

  return Effect.gen(function* () {
    const parsed = yield* Schema.decodeUnknown(SyncRequestSchema)(body, {
      onExcessProperty: "error",
    });
    const db = yield* DBFunctionsService;

    yield* db.syncPlan(parsed.plan);

    return { success: true };
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("ParseError", (e) => {
      return Effect.die(
        data("Invalid request body: " + e.message, { status: 400 })
      );
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
