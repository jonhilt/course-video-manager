import { Console, Effect } from "effect";
import { requestDeviceCode } from "@/services/ai-hero-auth-service";
import { runtimeLive } from "@/services/layer";

/**
 * Initiates AI Hero device authorization flow.
 * Returns a device code, user code, and verification URI.
 */
export const action = async () => {
  return Effect.gen(function* () {
    const result = yield* requestDeviceCode;
    return Response.json({
      deviceCode: result.device_code,
      userCode: result.user_code,
      verificationUri: result.verification_uri,
      expiresIn: result.expires_in,
      interval: result.interval,
    });
  }).pipe(
    Effect.tapErrorCause((e) => Console.log(e)),
    Effect.catchTag("AiHeroAuthError", (e) => {
      return Effect.succeed(
        Response.json({ error: e.message }, { status: 500 })
      );
    }),
    Effect.catchTag("ConfigError", () => {
      return Effect.succeed(
        Response.json(
          { error: "AI_HERO_BASE_URL is not configured" },
          { status: 500 }
        )
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
