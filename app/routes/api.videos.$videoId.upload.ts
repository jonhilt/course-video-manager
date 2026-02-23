import { getVideoPath } from "@/lib/get-video";
import { DBFunctionsService } from "@/services/db-service";
import { getValidAccessToken } from "@/services/youtube-auth-service";
import {
  setYouTubeThumbnail,
  uploadVideoToYouTube,
} from "@/services/youtube-upload-service";
import { runtimeLive } from "@/services/layer";
import { Effect } from "effect";
import type { Route } from "./+types/api.videos.$videoId.upload";

export const action = async (args: Route.ActionArgs) => {
  const { videoId } = args.params;
  const body = await args.request.json();
  const title: string = body.title;
  const description: string = body.description;
  const privacyStatus: "public" | "unlisted" =
    body.privacyStatus === "public" ? "public" : "unlisted";

  if (!title || !description) {
    return Response.json(
      { error: "Title and description are required" },
      { status: 400 }
    );
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
        const db = yield* DBFunctionsService;
        const accessToken = yield* getValidAccessToken;

        const result = yield* uploadVideoToYouTube({
          accessToken,
          filePath,
          title,
          description,
          privacyStatus,
          onProgress: (percentage) => {
            sendEvent("progress", { percentage });
          },
        });

        // Set selected thumbnail on YouTube if one exists
        const thumbnails = yield* db.getThumbnailsByVideoId(videoId);
        const selected = thumbnails.find((t) => t.selectedForUpload);

        if (selected?.filePath) {
          yield* setYouTubeThumbnail({
            accessToken,
            youtubeVideoId: result.videoId,
            thumbnailFilePath: selected.filePath,
          });
        }

        sendEvent("complete", { videoId: result.videoId });
      });

      program
        .pipe(
          Effect.catchTag("NotAuthenticatedError", () =>
            Effect.sync(() => {
              sendEvent("error", {
                message: "Not authenticated with YouTube",
              });
            })
          ),
          Effect.catchTag("YouTubeUploadError", (e) =>
            Effect.sync(() => {
              sendEvent("error", { message: e.message });
            })
          ),
          Effect.catchAll(() =>
            Effect.sync(() => {
              sendEvent("error", { message: "Upload failed unexpectedly" });
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
