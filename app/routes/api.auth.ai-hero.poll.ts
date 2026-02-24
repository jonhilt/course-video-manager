import { Console, Effect } from "effect";
import { pollForToken } from "@/services/ai-hero-auth-service";
import { runtimeLive } from "@/services/layer";

/**
 * Polls AI Hero's token endpoint for device authorization completion.
 * This is a long-running request that polls every 5 seconds until
 * the user authorizes or the code expires (10 min timeout).
 */
export const action = async ({ request }: { request: Request }) => {
  const body = await request.json();
  const deviceCode = body.deviceCode as string;

  if (!deviceCode) {
    return Response.json({ error: "deviceCode is required" }, { status: 400 });
  }

  return Effect.gen(function* () {
    const result = yield* pollForToken(deviceCode);
    return Response.json({
      success: true,
      userId: result.userId,
    });
  }).pipe(
    Effect.tapErrorCause((e) => Console.log(e)),
    Effect.catchTag("AiHeroAuthError", (e) => {
      return Effect.succeed(
        Response.json({ error: e.message, code: e.code }, { status: 400 })
      );
    }),
    Effect.catchAll(() => {
      return Effect.succeed(
        Response.json({ error: "Internal server error" }, { status: 500 })
      );
    }),
    runtimeLive.runPromise
  );
};
