import { getVideoPath } from "@/lib/get-video";
import { postToAiHero } from "@/services/ai-hero-upload-service";
import { runtimeLive } from "@/services/layer";
import { Effect } from "effect";
import type { Route } from "./+types/api.videos.$videoId.post-ai-hero";

export const action = async (args: Route.ActionArgs) => {
  const { videoId } = args.params;
  const body = await args.request.json();
  const title: string = body.title;
  const postBody: string = body.body;
  const description: string = body.description;

  if (!title) {
    return Response.json({ error: "Title is required" }, { status: 400 });
  }

  const filePath = getVideoPath(videoId);

  // Set up SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      const program = Effect.gen(function* () {
        const result = yield* postToAiHero({
          filePath,
          title,
          body: postBody ?? "",
          description: description ?? "",
        });

        sendEvent("complete", { slug: result.slug });
      });

      program
        .pipe(
          Effect.catchTag("AiHeroNotAuthenticatedError", () =>
            Effect.sync(() => {
              sendEvent("error", {
                message: "Not authenticated with AI Hero",
              });
            })
          ),
          Effect.catchTag("AiHeroUploadError", (e) =>
            Effect.sync(() => {
              sendEvent("error", { message: e.message });
            })
          ),
          Effect.catchAll(() =>
            Effect.sync(() => {
              sendEvent("error", {
                message: "AI Hero post failed unexpectedly",
              });
            })
          ),
          runtimeLive.runPromise
        )
        .finally(() => {
          controller.close();
        });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};
