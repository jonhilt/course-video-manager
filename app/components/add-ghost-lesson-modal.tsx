import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { capitalizeTitle } from "@/utils/capitalize-title";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";

export function AddGhostLessonModal(props: {
  sectionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetcher?: ReturnType<typeof useFetcher>;
  adjacentLessonId?: string | null;
  position?: "before" | "after" | null;
}) {
  const internalFetcher = useFetcher();
  const fetcher = props.fetcher ?? internalFetcher;
  const [title, setTitle] = useState("");
  const isValid = title.trim().length > 0;

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) setTitle("");
        props.onOpenChange(open);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {props.position === "before"
              ? "Add Lesson Before"
              : props.position === "after"
                ? "Add Lesson After"
                : "Add Lesson"}
          </DialogTitle>
        </DialogHeader>
        <fetcher.Form
          method="post"
          action="/api/lessons/add-ghost"
          className="space-y-4 py-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!isValid) return;
            const formData = new FormData(e.currentTarget);
            formData.set("title", capitalizeTitle(title.trim()));
            await fetcher.submit(formData, {
              method: "post",
              action: "/api/lessons/add-ghost",
            });
            setTitle("");
            props.onOpenChange(false);
          }}
        >
          <input type="hidden" name="sectionId" value={props.sectionId} />
          {props.adjacentLessonId && (
            <input
              type="hidden"
              name="adjacentLessonId"
              value={props.adjacentLessonId}
            />
          )}
          {props.position && (
            <input type="hidden" name="position" value={props.position} />
          )}
          <div className="space-y-2">
            <Label htmlFor="ghost-lesson-title">Title</Label>
            <Input
              id="ghost-lesson-title"
              name="title"
              placeholder="e.g. Understanding Generics"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => {
                setTitle("");
                props.onOpenChange(false);
              }}
              type="button"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid}>
              {fetcher.state === "submitting" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Add Lesson"
              )}
            </Button>
          </div>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}
