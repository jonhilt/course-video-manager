import { Console, Effect } from "effect";
import { runtimeLive } from "@/services/layer";
import { DBFunctionsService } from "@/services/db-service";

/**
 * Get AI Hero auth status. Returns whether connected and user ID if so.
 */
export const loader = async () => {
  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const auth = yield* db.getAiHeroAuth();

    if (!auth) {
      return Response.json({ connected: false });
    }

    return Response.json({
      connected: true,
      userId: auth.userId,
    });
  }).pipe(
    Effect.tapErrorCause((e) => Console.log(e)),
    Effect.catchAll(() => {
      return Effect.succeed(
        Response.json({ error: "Internal server error" }, { status: 500 })
      );
    }),
    runtimeLive.runPromise
  );
};
