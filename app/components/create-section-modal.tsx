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
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";

export function CreateSectionModal(props: {
  repoVersionId: string;
  maxOrder: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetcher?: ReturnType<typeof useFetcher>;
}) {
  const internalFetcher = useFetcher<{ error?: string }>();
  const fetcher = props.fetcher ?? internalFetcher;
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isValid = title.trim().length > 0;

  // If the server returns an error after optimistic close, reopen the modal
  useEffect(() => {
    const errorMsg = (fetcher.data as { error?: string } | undefined)?.error;
    if (errorMsg && fetcher.state === "idle") {
      setError(errorMsg);
      props.onOpenChange(true);
    }
  }, [fetcher.data, fetcher.state, props.onOpenChange]);

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) setTitle("");
        if (open) setError(null);
        props.onOpenChange(open);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Section</DialogTitle>
        </DialogHeader>
        <fetcher.Form
          method="post"
          action="/api/sections/create"
          className="space-y-4 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isValid) return;
            setError(null);
            const formData = new FormData(e.currentTarget);
            formData.set("title", capitalizeTitle(title.trim()));
            fetcher.submit(formData, {
              method: "post",
              action: "/api/sections/create",
            });
            // Optimistically close modal immediately
            setTitle("");
            props.onOpenChange(false);
          }}
        >
          <input
            type="hidden"
            name="repoVersionId"
            value={props.repoVersionId}
          />
          <input type="hidden" name="maxOrder" value={props.maxOrder} />
          <div className="space-y-2">
            <Label htmlFor="section-title">Title</Label>
            <Input
              id="section-title"
              name="title"
              placeholder="e.g. Advanced Patterns"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
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
                "Create Section"
              )}
            </Button>
          </div>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}
