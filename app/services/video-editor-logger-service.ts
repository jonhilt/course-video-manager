import { Effect } from "effect";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

// ============================================================================
// Log Event Types
// ============================================================================

export type LogEvent =
  | {
      type: "clips-appended";
      videoId: string;
      insertionPoint: unknown;
      clips: { inputVideo: string; startTime: number; endTime: number }[];
      generatedOrders: string[];
    }
  | {
      type: "clips-appended-from-obs";
      videoId: string;
      detected: number;
      duplicatesSkipped: number;
      inserted: number;
      clips: { inputVideo: string; startTime: number; endTime: number }[];
    }
  | {
      type: "clips-archived";
      clipIds: string[];
    }
  | {
      type: "clips-updated";
      clips: {
        id: string;
        scene?: string;
        profile?: string;
        beatType?: string;
      }[];
    }
  | {
      type: "beat-updated";
      clipId: string;
      beatType: string;
    }
  | {
      type: "clip-reordered";
      clipId: string;
      direction: "up" | "down";
    }
  | {
      type: "clip-section-created";
      sectionId: string;
      name: string;
      order: string;
    }
  | {
      type: "clip-section-updated";
      clipSectionId: string;
      name: string;
    }
  | {
      type: "clip-sections-archived";
      clipSectionIds: string[];
    }
  | {
      type: "clip-section-reordered";
      clipSectionId: string;
      direction: "up" | "down";
    }
  | {
      type: "transcription-requested";
      clipIds: string[];
    }
  | {
      type: "transcription-completed";
      clipIds: string[];
    }
  | {
      type: "cli-output";
      command: string;
      stdout?: string;
      stderr?: string;
    }
  | {
      type: "video-exported";
      videoId: string;
    }
  | {
      type: "video-created-from-selection";
      sourceVideoId: string;
      clipIds: string[];
      newVideoId: string;
    };

// ============================================================================
// Service
// ============================================================================

const LOG_DIR = path.resolve(".data/logs");

export class VideoEditorLoggerService extends Effect.Service<VideoEditorLoggerService>()(
  "VideoEditorLoggerService",
  {
    effect: Effect.gen(function* () {
      const getLogPath = (videoId: string): string => {
        return path.join(LOG_DIR, `${videoId}.log`);
      };

      const log = Effect.fn("VideoEditorLoggerService.log")(function* (
        videoId: string,
        event: LogEvent
      ) {
        const logPath = getLogPath(videoId);

        mkdirSync(LOG_DIR, { recursive: true });

        const timestamp = new Date().toISOString();
        const line = `${timestamp} [${event.type}] ${JSON.stringify(event)}\n`;

        appendFileSync(logPath, line, "utf-8");
      });

      return { log, getLogPath };
    }),
  }
) {}
