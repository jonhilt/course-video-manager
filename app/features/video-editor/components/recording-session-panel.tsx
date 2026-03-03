import {
  Loader2,
  CircleDotIcon,
  AlertTriangleIcon,
  Trash2Icon,
  ArchiveIcon,
} from "lucide-react";
import { useContextSelector } from "use-context-selector";
import { VideoEditorContext } from "../video-editor-context";
import type { SessionPanelData } from "../video-editor-selectors";
import type {
  ClipOptimisticallyAdded,
  ClipOnDatabase,
} from "../clip-state-reducer";
import { cn } from "@/lib/utils";

/**
 * Renders a single pending clip row within a session panel.
 * Shows appropriate icon and label based on clip/session state:
 * - "Detecting silence..." with spinner while recording
 * - "Processing..." with spinner after recording stops
 * - "No clip found" with warning icon when orphaned
 */
const PendingClipRow = ({
  clip,
  isRecording,
  onDelete,
}: {
  clip: ClipOptimisticallyAdded;
  isRecording: boolean;
  onDelete: () => void;
}) => {
  const isOrphaned = clip.isOrphaned === true;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded text-sm",
        isOrphaned ? "bg-amber-950/30" : "bg-gray-800/50"
      )}
    >
      {isOrphaned ? (
        <AlertTriangleIcon className="size-4 text-amber-500 shrink-0" />
      ) : (
        <Loader2 className="size-4 animate-spin text-blue-400 shrink-0" />
      )}
      <span
        className={cn(
          "flex-1",
          isOrphaned ? "text-amber-300" : "text-gray-400"
        )}
      >
        {isOrphaned
          ? "No clip found"
          : isRecording
            ? "Detecting silence..."
            : "Processing..."}
      </span>
      <span className="text-[10px] text-gray-500">
        #{clip.insertionOrder} · {clip.scene} / {clip.profile}
      </span>
      <button
        onClick={onDelete}
        className="text-gray-500 hover:text-red-400 p-1 rounded hover:bg-gray-700/50 transition-colors"
        title="Delete clip"
      >
        <Trash2Icon className="size-3.5" />
      </button>
    </div>
  );
};

/**
 * Renders a single archived clip row.
 * Shows transcript text for resolved (ClipOnDatabase) clips,
 * or "Awaiting clip..." for unresolved (ClipOptimisticallyAdded) clips.
 */
const ArchivedClipRow = ({
  clip,
}: {
  clip: ClipOptimisticallyAdded | ClipOnDatabase;
}) => {
  const isResolved = clip.type === "on-database";

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded text-sm bg-red-950/10">
      <ArchiveIcon className="size-3.5 text-red-400/50 shrink-0" />
      <span
        className={cn(
          "flex-1 line-through",
          isResolved ? "text-gray-400" : "text-gray-500"
        )}
      >
        {isResolved ? clip.text || "No transcript" : "Awaiting clip..."}
      </span>
      <span className="text-[10px] text-gray-600">
        #{clip.insertionOrder ?? "?"}
      </span>
    </div>
  );
};

/**
 * Renders a single session panel with header, pending clips, and archived sub-section.
 */
const SessionPanel = ({ panel }: { panel: SessionPanelData }) => {
  const dispatch = useContextSelector(
    VideoEditorContext,
    (ctx) => ctx.dispatch
  );

  const hasArchived = panel.archivedClips.length > 0;

  return (
    <div className="rounded-lg border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="bg-gray-800/80 px-4 py-2.5 flex items-center gap-3">
        <span className="text-sm font-medium text-gray-200">
          Session {panel.displayNumber}
        </span>
        {panel.isRecording && (
          <span className="flex items-center gap-1.5 text-xs text-red-400">
            <CircleDotIcon className="size-3 animate-pulse" />
            Recording
          </span>
        )}
      </div>

      {/* Pending clips */}
      {panel.pendingClips.length > 0 && (
        <div className="p-2 space-y-1.5">
          {panel.pendingClips.map((clip) => (
            <PendingClipRow
              key={clip.frontendId}
              clip={clip}
              isRecording={panel.isRecording}
              onDelete={() =>
                dispatch({
                  type: "delete-clip",
                  clipId: clip.frontendId,
                })
              }
            />
          ))}
        </div>
      )}

      {/* Archived sub-section — always visible when items exist */}
      {hasArchived && (
        <div className="border-t border-gray-700/50">
          <div className="px-4 py-2 bg-red-950/20">
            <span className="text-xs text-red-300/70">
              {panel.archivedClips.length} deleted
            </span>
          </div>
          <div className="p-2 space-y-1">
            {panel.archivedClips.map((clip) => (
              <ArchivedClipRow key={clip.frontendId} clip={clip} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * RecordingSessionPanel renders per-session panels below the main timeline.
 * Each panel shows pending optimistic clips with their current state,
 * and an archived sub-section for deleted clips.
 * Panels disappear when they have no remaining pending or archived clips.
 */
export const RecordingSessionPanels = () => {
  const sessionPanels = useContextSelector(
    VideoEditorContext,
    (ctx) => ctx.sessionPanels
  );

  if (sessionPanels.length === 0) return null;

  return (
    <div className="space-y-3">
      {sessionPanels.map((panel) => (
        <SessionPanel key={panel.sessionId} panel={panel} />
      ))}
    </div>
  );
};
