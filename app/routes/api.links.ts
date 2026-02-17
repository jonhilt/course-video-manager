import { Console, Effect, Schema } from "effect";
import type { Route } from "./+types/api.links";
import { runtimeLive } from "@/services/layer";
import { data } from "react-router";
import { DBFunctionsService } from "@/services/db-service";

const CreateLinkSchema = Schema.Struct({
  title: Schema.String,
  url: Schema.String,
  description: Schema.optional(Schema.NullOr(Schema.String)),
});

export const loader = async (_args: Route.LoaderArgs) => {
  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const links = yield* db.getLinks();

    return { links };
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
  const url = formData.get("url");
  const description = formData.get("description");

  return Effect.gen(function* () {
    const parsed = yield* Schema.decodeUnknown(CreateLinkSchema)({
      title,
      url,
      description: description || null,
    });

    // Basic URL validation
    try {
      new URL(parsed.url);
    } catch {
      return yield* Effect.die(data("Invalid URL format", { status: 400 }));
    }

    const db = yield* DBFunctionsService;

    const link = yield* db.createLink({
      title: parsed.title,
      url: parsed.url,
      description: parsed.description,
    });

    return { link };
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchTag("ParseError", (e) => {
      return Effect.die(data("Invalid request: " + e.message, { status: 400 }));
    }),
    Effect.catchAll((e) => {
      // Check for unique constraint violation (duplicate URL)
      if (
        e &&
        typeof e === "object" &&
        "cause" in e &&
        e.cause &&
        typeof e.cause === "object" &&
        "code" in e.cause &&
        e.cause.code === "23505"
      ) {
        return Effect.die(
          data("A link with this URL already exists", { status: 409 })
        );
      }
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
