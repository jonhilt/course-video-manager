import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Ghost, Loader2, AlertTriangle } from "lucide-react";
import { useFetcher } from "react-router";

export function ConvertToGhostModal(props: {
  lessonId: string;
  lessonTitle: string;
  hasFilesOnDisk: boolean;
  hasVideos: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fetcher = useFetcher();
  const canConvert = !props.hasFilesOnDisk && !props.hasVideos;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ghost className="w-5 h-5" />
            Convert to Ghost
          </DialogTitle>
          <DialogDescription>
            Convert "{props.lessonTitle}" to a ghost lesson. Ghost lessons exist
            only in the database and have no files on disk.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {props.hasFilesOnDisk && (
            <div className="flex items-start gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 rounded-md p-3">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                This lesson has files on disk. Remove them before converting to
                ghost.
              </span>
            </div>
          )}
          {props.hasVideos && (
            <div className="flex items-start gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 rounded-md p-3">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                This lesson has videos attached. Remove them before converting
                to ghost.
              </span>
            </div>
          )}
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => props.onOpenChange(false)}
              type="button"
            >
              Cancel
            </Button>
            <Button
              disabled={!canConvert}
              onClick={() => {
                fetcher.submit(null, {
                  method: "post",
                  action: `/api/lessons/${props.lessonId}/convert-to-ghost`,
                });
                props.onOpenChange(false);
              }}
            >
              {fetcher.state === "submitting" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Convert to Ghost"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
