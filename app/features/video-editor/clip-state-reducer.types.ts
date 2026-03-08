import type { DB } from "@/db/schema";
import type { BeatType } from "@/services/video-processing-service";
import type { Brand } from "./utils";

export type DatabaseId = Brand<string, "DatabaseId">;
export type FrontendId = Brand<string, "FrontendId">;
export type FrontendInsertionPoint =
  | {
      type: "start";
    }
  | {
      type: "after-clip";
      frontendClipId: FrontendId;
    }
  | {
      type: "after-clip-section";
      frontendClipSectionId: FrontendId;
    }
  | {
      type: "end";
    };

export type ClipOnDatabase = {
  type: "on-database";
  frontendId: FrontendId;
  databaseId: DatabaseId;
  videoFilename: string;
  sourceStartTime: number; // Start time in source video (seconds)
  sourceEndTime: number; // End time in source video (seconds)
  text: string;
  transcribedAt: Date | null;
  scene: string | null;
  profile: string | null;
  insertionOrder: number | null;
  beatType: BeatType;
  /**
   * If true, this clip has been archived by the user (deleted from session panel).
   * The clip stays in state so it can appear in the archived sub-section of the
   * session panel, showing its transcript text.
   */
  shouldArchive?: boolean;
  /**
   * The recording session this clip belongs to. Only set when the clip was
   * created from an archived optimistic clip, so it can be grouped in the
   * correct session panel's archived sub-section.
   */
  sessionId?: SessionId;
};

export type ClipOptimisticallyAdded = {
  type: "optimistically-added";
  frontendId: FrontendId;
  scene: string;
  profile: string;
  /**
   * An integer, incremented each time a new optimistically added clip is added.
   * Used to determine which clips should be paired with which database clips,
   * and to handle the deletion of the latest inserted clip.
   */
  insertionOrder: number;
  /**
   * If true, when the optimistically added clip is replaced with the database clip,
   * the clip will be archived. Allows the user to delete the clip before it's transcribed.
   */
  shouldArchive?: boolean;
  beatType: BeatType;
  /**
   * Unique ID for the sound detection that triggered this clip.
   * Used for deduplication - prevents duplicate clips from React StrictMode double-firing.
   */
  soundDetectionId: string;
  /**
   * The recording session this clip belongs to.
   * Used to group optimistic clips in per-session UI panels.
   */
  sessionId: SessionId;
  /**
   * If true, this clip has been marked as orphaned — no matching DB clip
   * will arrive. Set by the session-polling-complete action after the session timeout fires.
   */
  isOrphaned?: boolean;
};

export const createFrontendId = (): FrontendId => {
  return crypto.randomUUID() as FrontendId;
};

export type Clip = ClipOnDatabase | ClipOptimisticallyAdded;

export type ClipSectionOnDatabase = {
  type: "clip-section-on-database";
  frontendId: FrontendId;
  databaseId: DatabaseId;
  name: string;
  insertionOrder: number | null;
};

export type ClipSectionOptimisticallyAdded = {
  type: "clip-section-optimistically-added";
  frontendId: FrontendId;
  name: string;
  insertionOrder: number;
  shouldArchive?: boolean;
};

export type ClipSection =
  | ClipSectionOnDatabase
  | ClipSectionOptimisticallyAdded;

export type TimelineItem = Clip | ClipSection;

export type EditorError = {
  message: string;
  effectType: string;
  timestamp: number;
};

export type SessionId = Brand<string, "SessionId">;

export const createSessionId = (): SessionId => {
  return crypto.randomUUID() as SessionId;
};

export type RecordingSessionStatus = "recording" | "polling" | "done";

export type RecordingSession = {
  id: SessionId;
  displayNumber: number;
  status: RecordingSessionStatus;
  outputPath: string;
  startedAt: number;
};

export type ClipReducerState = {
  items: TimelineItem[];
  clipIdsBeingTranscribed: Set<FrontendId>;
  insertionPoint: FrontendInsertionPoint;
  insertionOrder: number;
  /**
   * When set, indicates a fatal error has occurred in the video editor.
   * The editor should display an error overlay and require a page refresh.
   */
  error: EditorError | null;
  /**
   * Recording sessions. Each session groups optimistic clips created during
   * a single recording. Session numbering resets on page reload.
   */
  sessions: RecordingSession[];
};

export type ClipReducerAction =
  | {
      type: "recording-started";
      outputPath: string;
    }
  | {
      type: "recording-stopped";
    }
  | {
      type: "session-polling-complete";
      sessionId: SessionId;
    }
  | {
      type: "new-optimistic-clip-detected";
      scene: string;
      profile: string;
      soundDetectionId: string;
    }
  | {
      type: "new-database-clips";
      clips: DB.Clip[];
      outputPath?: string;
    }
  | {
      type: "clips-deleted";
      clipIds: FrontendId[];
    }
  | {
      type: "clips-retranscribing";
      clipIds: FrontendId[];
    }
  | {
      type: "clips-transcribed";
      clips: {
        databaseId: DatabaseId;
        text: string;
      }[];
    }
  | {
      type: "set-insertion-point-after";
      clipId: FrontendId;
    }
  | {
      type: "set-insertion-point-before";
      clipId: FrontendId;
    }
  | {
      type: "delete-latest-inserted-clip";
    }
  | {
      type: "toggle-beat-at-insertion-point";
    }
  | {
      type: "toggle-beat-for-clip";
      clipId: FrontendId;
    }
  | {
      type: "move-clip";
      clipId: FrontendId;
      direction: "up" | "down";
    }
  | {
      type: "add-clip-section";
      name: string;
    }
  | {
      type: "update-clip-section";
      clipSectionId: FrontendId;
      name: string;
    }
  | {
      type: "add-clip-section-at";
      name: string;
      position: "before" | "after";
      itemId: FrontendId;
    }
  | {
      type: "clip-section-created";
      frontendId: FrontendId;
      databaseId: DatabaseId;
    }
  | {
      type: "restore-clip";
      clipId: FrontendId;
    }
  | {
      type: "permanently-remove-archived";
      sessionId: SessionId;
    }
  | {
      type: "permanently-remove-all-archived";
    }
  | {
      type: "effect-failed";
      effectType: string;
      message: string;
    };

export type ClipReducerEffect =
  | {
      type: "transcribe-clips";
      clipIds: DatabaseId[];
    }
  | {
      type: "archive-clips";
      clipIds: DatabaseId[];
    }
  | {
      type: "scroll-to-insertion-point";
    }
  | {
      type: "update-clips";
      clips: [
        DatabaseId,
        { scene: string; profile: string; beatType: BeatType },
      ][];
    }
  | {
      type: "update-beat";
      clipId: DatabaseId;
      beatType: BeatType;
    }
  | {
      type: "reorder-clip";
      clipId: DatabaseId;
      direction: "up" | "down";
    }
  | {
      type: "reorder-clip-section";
      clipSectionId: DatabaseId;
      direction: "up" | "down";
    }
  | {
      type: "archive-clip-sections";
      clipSectionIds: DatabaseId[];
    }
  | {
      type: "create-clip-section";
      frontendId: FrontendId;
      name: string;
      insertionPoint: FrontendInsertionPoint;
    }
  | {
      type: "update-clip-section";
      clipSectionId: DatabaseId;
      name: string;
    }
  | {
      type: "create-clip-section-at";
      frontendId: FrontendId;
      name: string;
      position: "before" | "after";
      targetItemId: DatabaseId;
      targetItemType: "clip" | "clip-section";
    }
  | {
      type: "start-session-timeout";
      sessionId: SessionId;
    }
  | {
      type: "unarchive-clips";
      clipIds: DatabaseId[];
    }
  | {
      type: "start-session-polling";
      sessionId: SessionId;
      outputPath: string;
    }
  | {
      type: "revalidate-loader";
    };

export type ClipReducerExec = (effect: ClipReducerEffect) => void;
