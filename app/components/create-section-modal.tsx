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
import { useState } from "react";

export function CreateSectionModal(props: {
  repoVersionId: string;
  maxOrder: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateSection: (title: string) => void;
}) {
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
          <DialogTitle>Create Section</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isValid) return;
            const capitalizedTitle = capitalizeTitle(title.trim());
            props.onCreateSection(capitalizedTitle);
            setTitle("");
            props.onOpenChange(false);
          }}
        >
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
              Create Section
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
