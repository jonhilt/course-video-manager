import { publishToBlog } from "@/services/blog-publish-service";
import { runtimeLive } from "@/services/layer.server";
import { Effect } from "effect";
import type { Route } from "./+types/api.videos.$videoId.post-blog";

export const action = async (args: Route.ActionArgs) => {
  const body = await args.request.json();
  const title: string =
    typeof body.title === "string" ? body.title.trim() : body.title;
  const postBody: string = body.body;
  const description: string =
    typeof body.description === "string"
      ? body.description.trim()
      : body.description;
  const slug: string = body.slug ?? "";

  if (!title) {
    return Response.json({ error: "Title is required" }, { status: 400 });
  }

  if (!slug) {
    return Response.json({ error: "Slug is required" }, { status: 400 });
  }

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
        const result = yield* publishToBlog({
          title,
          body: postBody ?? "",
          description: description ?? "",
          slug,
          onProgress: (percentage) => {
            sendEvent("progress", { percentage });
          },
        });

        sendEvent("complete", { slug: result.slug });
      });

      program
        .pipe(
          Effect.catchTag("BlogPublishError", (e) =>
            Effect.sync(() => {
              sendEvent("error", { message: e.message });
            })
          ),
          Effect.catchAll(() =>
            Effect.sync(() => {
              sendEvent("error", {
                message: "Blog publish failed unexpectedly",
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
