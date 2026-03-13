import { memo, useEffect, useRef, useState } from "react";
import { TimerIcon } from "lucide-react";

/**
 * Tracks elapsed time in seconds, resetting whenever any dependency changes.
 * Not persisted — purely local session incentive.
 */
function useSessionTimer(deps: unknown[]): number {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null);

  useEffect(() => {
    setElapsed(0);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return elapsed;
}

function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Self-contained session timer component. Owns the ticking state internally
 * so that the 1-second re-renders are isolated to this small subtree.
 */
export const SessionTimer = memo(function SessionTimer({
  videoId,
  mode,
}: {
  videoId: string;
  mode: string;
}) {
  const elapsed = useSessionTimer([videoId, mode]);
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums mr-2">
      <TimerIcon className="h-3 w-3" />
      {formatElapsed(elapsed)}
    </span>
  );
});
