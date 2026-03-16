import { Effect } from "effect";
import { runtimeLive } from "@/services/layer.server";
import { CoursePublishService } from "@/services/course-publish-service";
import type { Route } from "./+types/api.courseVersions.$versionId.batch-export-sse";

export const action = async (args: Route.ActionArgs) => {
  const { versionId } = args.params;

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
        yield* publishService.batchExport(versionId, sendEvent);
      });

      program
        .pipe(
          Effect.catchTag("NotFoundError", () =>
            Effect.sync(() => {
              sendEvent("error", {
                videoId: null,
                message: "Version not found",
              });
            })
          ),
          Effect.catchAll((e) =>
            Effect.sync(() => {
              sendEvent("error", {
                videoId: null,
                message:
                  "message" in e && typeof e.message === "string"
                    ? e.message
                    : "Batch export failed unexpectedly",
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
