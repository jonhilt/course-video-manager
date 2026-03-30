import { Effect } from "effect";
import type { Route } from "./+types/videos.$videoId.export-fcpxml";
import { DBFunctionsService } from "@/services/db-service.server";
import { FFmpegCommandsService } from "@/services/ffmpeg-commands";
import { runtimeLive } from "@/services/layer.server";
import { withDatabaseDump } from "@/services/dump-service";
import { generateFcpxml } from "@/services/fcpxml-export";
import { data } from "react-router";

const AUTO_EDITED_VIDEO_FINAL_END_PADDING = 0.5;

export const loader = async (args: Route.LoaderArgs) => {
  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const ffmpeg = yield* FFmpegCommandsService;
    const { videoId } = args.params;

    const video = yield* db.getVideoWithClipsById(videoId, {
      withArchived: false,
    });

    const timelineName = video.lesson
      ? [video.lesson.section.path, video.lesson.path, video.path].join(" - ")
      : video.path;

    const clips = video.clips;
    const firstClip = clips[0];
    if (!firstClip) {
      return Effect.die(data("No clips found", { status: 400 }));
    }

    const fps = yield* ffmpeg.getFPS(firstClip.videoFilename);

    const fcpxmlClips = clips.map((clip, index) => {
      const isLastClip = index === clips.length - 1;
      const endPadding = isLastClip ? AUTO_EDITED_VIDEO_FINAL_END_PADDING : 0;
      return {
        inputVideo: clip.videoFilename,
        startTime: clip.sourceStartTime,
        duration: clip.sourceEndTime - clip.sourceStartTime + endPadding,
      };
    });

    const xml = generateFcpxml({ timelineName, clips: fcpxmlClips, fps });

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml",
        "Content-Disposition": `attachment; filename="${timelineName.replace(/[^a-zA-Z0-9-_ ]/g, "")}.fcpxml"`,
      },
    });
  }).pipe(
    withDatabaseDump,
    Effect.catchTag("NotFoundError", () => {
      return Effect.die(data("Video not found", { status: 404 }));
    }),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};
