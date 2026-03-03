import { Loader2, CircleDotIcon } from "lucide-react";
import { useContextSelector } from "use-context-selector";
import { VideoEditorContext } from "../video-editor-context";
import type { SessionPanelData } from "../video-editor-selectors";
import type { ClipOptimisticallyAdded } from "../clip-state-reducer";

/**
 * Renders a single pending clip row within a session panel.
 * Shows a spinner and "Detecting silence..." label.
 */
const PendingClipRow = ({ clip }: { clip: ClipOptimisticallyAdded }) => {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded text-sm bg-gray-800/50">
      <Loader2 className="size-4 animate-spin text-blue-400 shrink-0" />
      <span className="flex-1 text-gray-400">Detecting silence...</span>
      <span className="text-[10px] text-gray-500">
        #{clip.insertionOrder} · {clip.scene} / {clip.profile}
      </span>
    </div>
  );
};

/**
 * Renders a single session panel with header and pending clips.
 */
const SessionPanel = ({ panel }: { panel: SessionPanelData }) => {
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
      <div className="p-2 space-y-1.5">
        {panel.pendingClips.map((clip) => (
          <PendingClipRow key={clip.frontendId} clip={clip} />
        ))}
      </div>
    </div>
  );
};

/**
 * RecordingSessionPanel renders per-session panels below the main timeline.
 * Each panel shows pending optimistic clips with their current state.
 * Panels disappear when they have no remaining pending clips.
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
