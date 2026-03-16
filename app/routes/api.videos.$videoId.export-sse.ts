import { Effect } from "effect";
import { runtimeLive } from "@/services/layer.server";
import type { Route } from "./+types/api.videos.$videoId.export-sse";
import { CoursePublishService } from "@/services/course-publish-service";

export const action = async (args: Route.ActionArgs) => {
  const { videoId } = args.params;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      const program = Effect.gen(function* () {
        const publishService = yield* CoursePublishService;

        yield* publishService.exportVideo(videoId, (stage) => {
          sendEvent("stage", { stage });
        });

        sendEvent("complete", {});
      });

      program
        .pipe(
          Effect.catchTag("NotFoundError", () =>
            Effect.sync(() => {
              sendEvent("error", { message: "Video not found" });
            })
          ),
          Effect.catchAll((e) =>
            Effect.sync(() => {
              sendEvent("error", {
                message:
                  "message" in e && typeof e.message === "string"
                    ? e.message
                    : "Export failed unexpectedly",
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
