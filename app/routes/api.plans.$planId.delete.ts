import { Console, Effect } from "effect";
import type { Route } from "./+types/api.plans.$planId.delete";
import { DBFunctionsService } from "@/services/db-service";
import { runtimeLive } from "@/services/layer";
import { data, redirect } from "react-router";

export const action = async (args: Route.ActionArgs) => {
  const planId = args.params.planId;
  const referer = args.request.headers.get("referer") || "";
  const url = new URL(referer, "http://localhost");
  const shouldRedirectHome = url.pathname.startsWith(`/plans/${planId}`);

  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    yield* db.deletePlan(planId);

    if (shouldRedirectHome) {
      return redirect("/");
    }
    return { success: true };
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
